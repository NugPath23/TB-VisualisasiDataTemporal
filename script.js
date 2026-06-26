// 1. Inisialisasi Peta (Berpusat di Jawa Tengah)
const map = L.map('map').setView([-7.150975, 110.140259], 8);

// 2. Memuat Peta Dasar (Basemap) dari OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Variabel global untuk menyimpan data
let geojsonData;
let dataKlaster;
let geojsonLayer;
let myChart = null; 

// 3. Fungsi Pewarnaan berdasarkan Klaster K-Means
function getColor(klaster) {
    return klaster === 0 ? '#28a745' : // Hijau (Zona Aman)
           klaster === 1 ? '#ffc107' : // Kuning (Waspada Kemiskinan)
           klaster === 3 ? '#fd7e14' : // Oranye (Waspada DBD)
           klaster === 2 ? '#dc3545' : // Merah Pekat (Zona Kritis/KLB)
                           '#cccccc';  // Default abu-abu
}

// Membersihkan nama wilayah agar sinkron saat dicocokkan
function cleanName(text) {
    if (!text) return "";
    return text.toLowerCase()
               .replace('kabupaten', '')
               .replace('kab.', '')
               .replace('kota', '')
               .replace('kotamadyya', '')
               .trim();
}

// 4. Fungsi Styling Poligon Wilayah
function style(feature) {
    let namaGeo = feature.properties.nm_dati2 || feature.properties.NAME_2;
    let warna = '#cccccc'; 

    if (namaGeo) {
        let namaGeoClean = cleanName(namaGeo);
        
        // Proteksi Visual untuk wilayah non-administratif (Waduk)
        if (namaGeoClean.includes('waduk')) {
            return {
                fillColor: '#87CEFA', 
                weight: 1,
                opacity: 1,
                color: '#1E90FF',
                fillOpacity: 0.6
            };
        }

        if (dataKlaster) {
            let tahunAktif = document.getElementById('yearSlider').value;
            
            // Pencocokan menggunakan nama yang sudah dibersihkan dari imbuhan Kab/Kota
            let wilayahMatch = dataKlaster.find(d => 
                cleanName(d.kabupaten) === namaGeoClean && 
                d.tahun.toString() === tahunAktif
            );

            if (wilayahMatch) {
                warna = getColor(wilayahMatch.klaster);
            }
        }
    }

    return {
        fillColor: warna,
        weight: 1.5,
        opacity: 1,
        color: 'white',
        fillOpacity: 0.8
    };
}

// 5. Fungsi Interaksi Popup saat Poligon Diklik
function onEachFeature(feature, layer) {
    layer.on({
        click: function(e) {
            let namaGeo = feature.properties.nm_dati2 || feature.properties.NAME_2;
            if (!namaGeo) return;

            let namaGeoClean = cleanName(namaGeo);
            if (namaGeoClean.includes('waduk')) {
                layer.bindPopup(`<b>${namaGeo}</b>`).openPopup();
                return; 
            }

            let tahunAktif = document.getElementById('yearSlider').value;
            let wilayahMatch = dataKlaster.find(d => 
                cleanName(d.kabupaten) === namaGeoClean && 
                d.tahun.toString() === tahunAktif
            );

            if (wilayahMatch) {
                let labelKlaster = wilayahMatch.klaster === 0 ? "Aman" :
                                   wilayahMatch.klaster === 1 ? "Waspada Kemiskinan" :
                                   wilayahMatch.klaster === 3 ? "Waspada DBD" : "Kritis";

                let popupContent = `
                    <div style="font-family: sans-serif; min-width: 150px;">
                        <h4 style="margin: 0 0 5px 0; color: #333;">${wilayahMatch.kabupaten}</h4>
                        <hr style="border: 0.5px solid #ccc; margin: 5px 0;">
                        <b>Tahun:</b> ${wilayahMatch.tahun}<br>
                        <b>Kasus DBD:</b> ${wilayahMatch.kasus_dbd}<br>
                        <b>Kemiskinan:</b> ${wilayahMatch.kemiskinan}%<br>
                        <b>Status:</b> <span style="color:${getColor(wilayahMatch.klaster)}; font-weight:bold;">Zona ${labelKlaster}</span>
                    </div>
                `;
                layer.bindPopup(popupContent).openPopup();
            } else {
                layer.bindPopup(`<b>${namaGeo}</b><br>Data statistik tidak ditemukan.`).openPopup();
            }
        }
    });
}

// 6. Memuat Data JSON Klaster dan GeoJSON secara Asynchronous
Promise.all([
    fetch('data_jateng_clustered.json').then(res => res.json()),
    fetch('jateng.json').then(res => res.json())
]).then(([jsonKlaster, geojson]) => {
    dataKlaster = jsonKlaster;
    geojsonData = geojson;

    geojsonLayer = L.geoJSON(geojsonData, {
        style: style,
        onEachFeature: onEachFeature
    }).addTo(map);

    // Memuat data awal dashboard untuk tahun 2016
    updateDashboardInfo('2016');
    
}).catch(error => {
    console.error("Gagal memuat file JSON/GeoJSON. Pastikan Live Server aktif dan file berada di folder yang sama:", error);
});

// 7. Menangani Interaksi Time Slider
document.getElementById('yearSlider').addEventListener('input', function(e) {
    let tahunBaru = e.target.value;
    document.getElementById('yearLabel').innerText = tahunBaru;
    
    if (geojsonLayer) {
        geojsonLayer.setStyle(style); 
    }

    updateDashboardInfo(tahunBaru);
});

// 8. Fungsi Grafik & Statistik Ringkas
function updateDashboardInfo(tahun) {
    if (!dataKlaster) return;

    let dataTahunIni = dataKlaster.filter(d => d.tahun.toString() === tahun.toString());

    let countAman = dataTahunIni.filter(d => d.klaster === 0).length;
    let countWaspadaKemiskinan = dataTahunIni.filter(d => d.klaster === 1).length;
    let countWaspadaDBD = dataTahunIni.filter(d => d.klaster === 3).length;
    let countKritis = dataTahunIni.filter(d => d.klaster === 2).length;

    const chartElement = document.getElementById('barChart');
    if (!chartElement) {
        console.warn("Elemen canvas dengan id 'barChart' tidak ditemukan di HTML.");
        return;
    }
    
    const ctx = chartElement.getContext('2d');
    if (myChart) {
        myChart.destroy();
    }

    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Aman', 'Waspada (Miskin)', 'Waspada (DBD)', 'Kritis'],
            datasets: [{
                label: 'Jumlah Kabupaten/Kota',
                data: [countAman, countWaspadaKemiskinan, countWaspadaDBD, countKritis],
                backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    ticks: { stepSize: 5 } 
                }
            }
        }
    });

    let topDBD = [...dataTahunIni].sort((a, b) => b.kasus_dbd - a.kasus_dbd).slice(0, 3);
    
    const summaryElement = document.getElementById('summary-cards');
    if (summaryElement && topDBD.length >= 3) {
        summaryElement.innerHTML = `
            <p><b>Total Kasus DBD Jawa Tengah:</b> ${dataTahunIni.reduce((sum, d) => sum + d.kasus_dbd, 0).toLocaleString('id-ID')}</p>
            <hr style="border: 0.5px solid #ddd;">
            <p style="margin-bottom: 5px;"><b>Top 3 Kasus Tertinggi Tahun ${tahun}:</b></p>
            <ol style="margin-top: 0; padding-left: 20px;">
                <li>${topDBD[0].kabupaten} (${topDBD[0].kasus_dbd} kasus)</li>
                <li>${topDBD[1].kabupaten} (${topDBD[1].kasus_dbd} kasus)</li>
                <li>${topDBD[2].kabupaten} (${topDBD[2].kasus_dbd} kasus)</li>
            </ol>
        `;
    }
}