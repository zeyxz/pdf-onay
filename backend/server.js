const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const session = require("express-session");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

const app = express();

app.use(express.json());
app.use(cors());


// =====================
// 🔐 SESSION (login hafızası)
// =====================
app.use(session({
    secret: process.env.SESSION_SECRET || "gizliAnahtar",
    resave: false,
    saveUninitialized: false
}));


// =====================
// 🔒 LOGIN KONTROL (middleware)
// =====================
function auth(req, res, next) {
    if (req.session.loggedIn) {
        next(); // giriş yaptıysa devam et
    } else {
        res.redirect("/admin"); // yapmadıysa login'e at
    }
}


// =====================
// 🏠 SAYFA ROUTELARI
// =====================

// Ana sayfa → login ekranı
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// login sayfası
app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// login işlemi
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (
        username === process.env.ADMIN_USER &&
        password === process.env.ADMIN_PASS
    ) {
        req.session.loggedIn = true; // giriş başarılı
        return res.json({ success: true });
    }

    res.json({ success: false });
});

// çıkış
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/admin");
});


// =====================
// 🔒 ADMIN PANEL (korumalı)
// =====================
app.get("/upload-page", auth, (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/admin.html"));
});


// =====================
// 📄 MÜŞTERİ SAYFASI (public)
// =====================
app.get("/form", (req, res) => {
    const pdf = req.query.pdf;

    // link daha önce kullanıldıysa engelle
    if (kullanilanlar.has(pdf)) {
        return res.send("Bu link artık geçersiz.");
    }

    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});


// =====================
// 📁 STATIC DOSYALAR
// =====================
// ❗ Artık direkt /admin.html açılamaz
// sadece /scrty/... üzerinden erişilir
app.use("/scrty", express.static(path.join(__dirname, "../frontend")));


// =====================
// 📤 DOSYA YÜKLEME
// =====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../frontend/pdf"));
    },
    filename: (req, file, cb) => {
        const uniqueName = crypto.randomBytes(8).toString("hex") + ".pdf";
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });


// =====================
// 🔒 PDF YÜKLE (admin)
// =====================
app.post("/upload", auth, upload.single("pdf"), (req, res) => {
    const fileName = req.file.filename;

    // dinamik link (render uyumlu)
    const link = `${req.protocol}://${req.get("host")}/form?pdf=${fileName}`;

    res.json({ link });
});


// =====================
// 📄 PDF İŞLEME
// =====================
async function pdfOnayEkle(pdfPath) {
    const existingPdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const tarih = new Date().toLocaleString();

    pages.forEach(page => {
        const { width } = page.getSize();

        page.drawText("SMS YOLUYLA ONAYLANMISTIR.", {
            x: width / 2 + 10,
            y: 112,
            size: 10,
            font,
            color: rgb(0, 0, 0)
        });

        page.drawText(`Tarih: ${tarih}`, {
            x: width / 2 + 10,
            y: 100,
            size: 7,
            font,
            color: rgb(0, 0, 0)
        });
    });

    return await pdfDoc.save();
}


// =====================
// 🔁 TEK KULLANIMLIK LINK
// =====================
const kullanilanlar = new Set();


// =====================
// 📧 MAIL + ONAY
// =====================
app.post("/send-mail", async (req, res) => {
    const { pdf } = req.body;

    // geçersiz kontrol
    if (!pdf || !pdf.endsWith(".pdf")) {
        return res.status(400).send("Geçersiz PDF");
    }

    // ikinci kullanım engelle
    if (kullanilanlar.has(pdf)) {
        return res.status(400).send("Bu link zaten kullanıldı");
    }

    try {
        const originalPath = path.join(__dirname, "..", "frontend", "pdf", pdf);

        if (!fs.existsSync(originalPath)) {
            return res.status(404).send("PDF bulunamadı");
        }

        const pdfBuffer = await pdfOnayEkle(originalPath);

        // mail gönder
        let transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: "PDF Onaylandı",
            text: `PDF: ${pdf}`,
            attachments: [
                {
                    filename: "onayli.pdf",
                    content: pdfBuffer
                }
            ]
        });

        // kullanıldı olarak işaretle
        kullanilanlar.add(pdf);

        res.send("Onaylı PDF gönderildi");

    } catch (err) {
        res.status(500).send(err.message);
    }
});
app.get("/ping", (req, res) => {
    res.send("ok");
});

// =====================
// 🚀 SERVER
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server çalışıyor");
});