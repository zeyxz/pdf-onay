const params = new URLSearchParams(window.location.search);
const pdf = params.get("pdf");

// PDF kontrol
if (!pdf) {
    document.getElementById("durum").innerText = "PDF bulunamadı ❌";
} else {
    // PDF göster
    document.getElementById("pdfFrame").src = `/pdf/${pdf}`;
}

// mesaj yazdır
function logYaz(mesaj, renk = "black") {
    const durum = document.getElementById("durum");
    durum.innerText = mesaj;
    durum.style.color = renk;
}

function gonder() {
    const onay = document.getElementById("onay").checked;

    if (!onay) {
        logYaz("Lütfen onay kutusunu işaretleyin ❗", "red");
        return;
    }

    // gönderiliyor
    logYaz("Gönderiliyor...", "#555");

    fetch("/send-mail", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ pdf })
    })
    .then(res => res.text())
    .then(data => {
        logYaz("Onaylandı ✅", "green");

        // butonu devre dışı bırak (tekrar basılmasın)
      const btn = document.querySelector("button");
    btn.disabled = true;
    btn.innerText = "Onaylandı";
     btn.style.background = "#ccc";
    })
    .catch(err => {
        logYaz("Hata oluştu ❌", "red");
    });
}