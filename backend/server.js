const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const session = require("express-session");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { Resend } = require("resend");

const app = express();

const resend = new Resend(process.env.RESEND_API_KEY);

app.use(express.json());
app.use(cors());


// =====================
// 🔐 SESSION
// =====================
app.use(session({
    secret: process.env.SESSION_SECRET || "gizliAnahtar",
    resave: false,
    saveUninitialized: false
}));


// =====================
// 🔒 LOGIN KONTROL
// =====================
function auth(req, res, next) {

    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect("/admin");
    }
}


// =====================
// 🏠 SAYFA ROUTELARI
// =====================

// Ana sayfa
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// Login sayfası
app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// Login işlemi
app.post("/login", (req, res) => {

    const { username, password } = req.body;

    if (
        username === process.env.ADMIN_USER &&
        password === process.env.ADMIN_PASS
    ) {

        req.session.loggedIn = true;

        return res.json({ success: true });
    }

    res.json({ success: false });
});

// Çıkış
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/admin");
});


// =====================
// 🔒 ADMIN PANEL
// =====================
app.get("/upload-page", auth, (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/admin.html"));
});


// =====================
// 📄 MÜŞTERİ SAYFASI
// =====================
app.get("/form", (req, res) => {

    const pdf = req.query.pdf;

    if (kullanilanlar.has(pdf)) {
        return res.send("Bu link artık geçersiz.");
    }

    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});


// =====================
// 📁 STATIC DOSYALAR
// =====================
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
// 🔒 PDF YÜKLE
// =====================
app.post("/upload", auth, upload.single("pdf"), (req, res) => {

    const fileName = req.file.filename;

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

    console.log("SEND-MAIL ÇALIŞTI");

    const { pdf } = req.body;

    console.log("GELEN PDF:", pdf);

    // geçersiz kontrol
    if (!pdf || !pdf.endsWith(".pdf")) {

        console.log("PDF GEÇERSİZ");

        return res.status(400).send("Geçersiz PDF");
    }

    // ikinci kullanım engelle
    if (kullanilanlar.has(pdf)) {

        console.log("LINK ZATEN KULLANILMIŞ");

        return res.status(400).send("Bu link zaten kullanıldı");
    }

    try {

        const originalPath = path.join(__dirname, "..", "frontend", "pdf", pdf);

        console.log("PDF PATH:", originalPath);

        if (!fs.existsSync(originalPath)) {

            console.log("PDF BULUNAMADI");

            return res.status(404).send("PDF bulunamadı");
        }

        console.log("PDF İŞLENİYOR");

        const pdfBuffer = await pdfOnayEkle(originalPath);

        console.log("MAIL GÖNDERİLİYOR");

        const result = await resend.emails.send({

    from: "onboarding@resend.dev",

    to: process.env.EMAIL_USER,

    subject: `PDF Onayı - ${Date.now()}`,

    text: `PDF: ${pdf}`,

    attachments: [
        {
            filename: "onayli.pdf",
            content: Buffer.from(pdfBuffer).toString("base64")
        }
    ]
});

console.log(result);

        console.log("MAIL GÖNDERİLDİ");

        // kullanıldı olarak işaretle
        kullanilanlar.add(pdf);

        res.send("Onaylı PDF gönderildi");

    } catch (err) {

        console.log("MAIL HATASI");

        console.log(err);

        res.status(500).send(err.message);
    }
});


// =====================
// 🧪 TEST ROUTELARI
// =====================
app.get("/ping", (req, res) => {
    res.send("ok");
});

app.get("/test", (req, res) => {
    res.send("backend çalışıyor");
});


// =====================
// 🚀 SERVER
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server çalışıyor");
});