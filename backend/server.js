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

// 🔐 SESSION
app.use(session({
    secret: process.env.SESSION_SECRET || "gizliAnahtar123",
    resave: false,
    saveUninitialized: true
}));

// 🔒 LOGIN KONTROL
function auth(req, res, next) {
    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect("/admin");
    }
}

// 📁 STATIC
app.use(express.static(path.join(__dirname, "../frontend")));

// =====================
// ROUTES
// =====================

app.get("/", (req, res) => {
    res.redirect("/admin");
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if  (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
) {
        req.session.loggedIn = true;
        return res.json({ success: true });
    }

    res.json({ success: false });
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/admin");
});

app.get("/upload-page", auth, (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/admin.html"));
});

app.get("/form", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// =====================
// MULTER
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

// 🔒 PDF YÜKLE
app.post("/upload", auth, upload.single("pdf"), (req, res) => {
    const fileName = req.file.filename;
    const link = `${req.protocol}://${req.get("host")}/form?pdf=${fileName}`;
    res.json({ link });
});

// =====================
// PDF İŞLEME
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
// TEK KULLANIMLIK LINK
// =====================
const kullanilanlar = new Set();

// =====================
// MAIL
// =====================
app.post("/send-mail", async (req, res) => {
    const { pdf } = req.body;

    if (!pdf || !pdf.endsWith(".pdf")) {
        return res.status(400).send("Geçersiz PDF");
    }

    if (kullanilanlar.has(pdf)) {
        return res.status(400).send("Bu link zaten kullanıldı");
    }

    try {
        const originalPath = path.join(__dirname, "..", "frontend", "pdf", pdf);

        if (!fs.existsSync(originalPath)) {
            return res.status(404).send("PDF bulunamadı");
        }

        const pdfBuffer = await pdfOnayEkle(originalPath);

        // 🔥 ENV KULLANILIYOR
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

        kullanilanlar.add(pdf);

        res.send("Onaylı PDF gönderildi");

    } catch (err) {
        res.status(500).send(err.message);
    }
});

// =====================
// SERVER
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server çalışıyor");
});