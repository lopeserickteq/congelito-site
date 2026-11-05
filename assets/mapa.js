// Mapa dos pontos de venda: MapLibre + mapa gratuito do OpenFreeMap (sem chave).
// A localização do visitante fica só no navegador dele: nada é enviado nem gravado.
(function () {
  const el = document.getElementById("mapa");
  if (!el || !window.maplibregl || !window.PONTOS) return;
  const PONTOS = window.PONTOS;

  const map = new maplibregl.Map({
    container: el,
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [-47.88, -15.79],
    zoom: 9,
    attributionControl: { compact: true },
    cooperativeGestures: true
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  const limites = new maplibregl.LngLatBounds();
  PONTOS.forEach(p => limites.extend([p.lng, p.lat]));
  map.fitBounds(limites, { padding: 40, duration: 0 });

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rotas = p => "https://www.google.com/maps/dir/?api=1&destination=" + p.lat + "," + p.lng;

  function popupHTML(p, km) {
    const selos = p.venda.map(v => '<span class="selo-venda ' + v + '">' + (v === "delivery" ? "Delivery" : "Presencial") + "</span>").join("");
    return '<div class="pop">' +
      '<span class="pop-grupo">' + (p.grupo === "fdv" ? "Loja Fonte de Vida" : "Ponto de venda") + "</span>" +
      "<strong>" + esc(p.nome) + "</strong>" +
      "<p>" + esc(p.end) + "</p>" +
      (p.horario ? '<p class="pop-hora">' + esc(p.horario) + "</p>" : "") +
      '<div class="pop-selos">' + selos + "</div>" +
      (km != null ? '<p class="pop-km">a ' + km.toFixed(1).replace(".", ",") + " km de você</p>" : "") +
      '<div class="pop-links"><a href="' + rotas(p) + '" target="_blank" rel="noopener">Como chegar</a>' +
      (p.link ? '<a href="' + p.link + '" target="_blank" rel="noopener">Pedir no delivery</a>' : "") + "</div></div>";
  }

  const marcadores = {};
  PONTOS.forEach(p => {
    const pino = document.createElement("button");
    pino.type = "button";
    pino.className = "pino";
    pino.setAttribute("aria-label", p.nome);
    pino.innerHTML = '<svg viewBox="0 0 40 52" aria-hidden="true"><path d="M20 51C20 51 3 31 3 19a17 17 0 0 1 34 0c0 12-17 32-17 32z" fill="#e31a97" stroke="#fff" stroke-width="2.5"/><circle cx="20" cy="20" r="10" fill="#4c2986"/><path d="M21 9c3-5 9-5 11-3-3 3-7 4-11 3zM21 9c-1-4 1-7 4-8 1 3-1 6-4 8z" fill="#a9d920"/><rect x="18.6" y="17" width="2.8" height="7" rx="1.4" fill="#e31a97"/></svg>';
    const popup = new maplibregl.Popup({ offset: [0, -44], maxWidth: "280px" }).setHTML(popupHTML(p));
    marcadores[p.id] = new maplibregl.Marker({ element: pino, anchor: "bottom" }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map);
  });

  // distância em linha reta (km)
  function km(a, b) {
    const R = 6371, r = x => x * Math.PI / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  const caixa = document.getElementById("perto");
  const form = document.getElementById("busca-bairro");
  let voce = null;

  function mostrarMaisPerto(origem, rotulo) {
    const lista = PONTOS.map(p => ({ p, d: km(origem, p) })).sort((a, b) => a.d - b.d);
    if (voce) voce.remove();
    const ponto = document.createElement("div");
    ponto.className = "voce";
    voce = new maplibregl.Marker({ element: ponto }).setLngLat([origem.lng, origem.lat]).addTo(map);
    const [m1] = lista;
    const b = new maplibregl.LngLatBounds([origem.lng, origem.lat], [origem.lng, origem.lat]);
    lista.slice(0, 3).forEach(x => b.extend([x.p.lng, x.p.lat]));
    map.fitBounds(b, { padding: 60, maxZoom: 15 });
    PONTOS.forEach(p => marcadores[p.id].getPopup().setHTML(popupHTML(p, km(origem, p))));
    marcadores[m1.p.id].togglePopup();
    caixa.innerHTML = "<p><strong>Mais perto " + esc(rotulo) + ":</strong></p><ol>" +
      lista.slice(0, 3).map(x => '<li><button type="button" data-id="' + x.p.id + '">' + esc(x.p.nome) + "</button> <span>" + x.d.toFixed(1).replace(".", ",") + " km</span></li>").join("") + "</ol>";
  }

  caixa.addEventListener("click", e => {
    const id = e.target.closest("button[data-id]")?.dataset.id;
    if (!id) return;
    const m = marcadores[id];
    map.flyTo({ center: m.getLngLat(), zoom: 15 });
    if (!m.getPopup().isOpen()) m.togglePopup();
  });

  function pedirBairro(motivo) {
    form.hidden = false;
    caixa.innerHTML = "<p>" + motivo + " Digite seu bairro ou cidade:</p>";
    form.querySelector("input").focus();
  }

  document.getElementById("btn-perto").addEventListener("click", () => {
    if (!navigator.geolocation) return pedirBairro("Seu navegador não informa a localização.");
    caixa.innerHTML = "<p>Procurando você no mapa…</p>";
    navigator.geolocation.getCurrentPosition(
      pos => mostrarMaisPerto({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "de você"),
      () => pedirBairro("Sem acesso à sua localização."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const q = form.querySelector("input").value.trim();
    if (!q) return;
    caixa.innerHTML = "<p>Procurando " + esc(q) + "…</p>";
    try {
      // busca limitada ao DF e Entorno
      const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&viewbox=-48.4,-15.3,-47.1,-16.3&bounded=1&q=" + encodeURIComponent(q);
      const r = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
      const [achou] = await r.json();
      if (!achou) { caixa.innerHTML = "<p>Não achei " + esc(q) + " no DF e Entorno. Tente outro nome, como Sobradinho ou Águas Claras.</p>"; return; }
      mostrarMaisPerto({ lat: +achou.lat, lng: +achou.lon }, "de " + q);
    } catch (_) {
      caixa.innerHTML = "<p>A busca falhou agora. Navegue pelo mapa ou tente de novo em instantes.</p>";
    }
  });
})();
