function yukle() {
    const fileInput = document.getElementById("pdfFile");

    if (!fileInput.files[0]) {
        alert("PDF seç!");
        return;
    }

    const formData = new FormData();
    formData.append("pdf", fileInput.files[0]);

    fetch("/upload", {
        method: "POST",
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("link").innerText = data.link;
        document.getElementById("linkContainer").style.display = "block";
    })
    .catch(() => alert("Hata oluştu"));
}

// 📋 KOPYALA
function kopyala() {
    const link = document.getElementById("link").innerText;

    navigator.clipboard.writeText(link);

    document.getElementById("durum").innerText = "Link kopyalandı ✅";
}