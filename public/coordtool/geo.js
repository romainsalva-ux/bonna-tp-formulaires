/* Géodésie — conversions de coordonnées (sans dépendance, fonctionne hors-ligne)
 * Systèmes : WGS84 / RGF93 géographique, Lambert 93, CC42…CC50, Lambert I-IV & II étendu (NTF),
 *            UTM (WGS84), Web Mercator.
 */
(function (root) {
  "use strict";
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  // ---------- Ellipsoïdes ----------
  function ell(a, f) { return { a: a, f: f, e2: f * (2 - f), e: Math.sqrt(f * (2 - f)) }; }
  var ELL = {
    WGS84: ell(6378137, 1 / 298.257223563),
    GRS80: ell(6378137, 1 / 298.257222101),
    CLARKE_IGN: ell(6378249.2, (6378249.2 - 6356515) / 6378249.2)
  };

  // ---------- Changement de datum (géocentrique + translation) ----------
  function geoToCart(lat, lon, h, E) {
    var p = lat * D2R, l = lon * D2R, s = Math.sin(p);
    var N = E.a / Math.sqrt(1 - E.e2 * s * s);
    return [(N + h) * Math.cos(p) * Math.cos(l), (N + h) * Math.cos(p) * Math.sin(l), (N * (1 - E.e2) + h) * s];
  }
  function cartToGeo(X, Y, Z, E) {
    var p = Math.sqrt(X * X + Y * Y), lon = Math.atan2(Y, X);
    var lat = Math.atan2(Z, p * (1 - E.e2)), N, h = 0;
    for (var i = 0; i < 10; i++) {
      var s = Math.sin(lat);
      N = E.a / Math.sqrt(1 - E.e2 * s * s);
      h = p / Math.cos(lat) - N;
      lat = Math.atan2(Z, p * (1 - E.e2 * N / (N + h)));
    }
    return { lat: lat * R2D, lon: lon * R2D, h: h };
  }
  // NTF -> WGS84 : translation IGN (-168, -60, +320) — précision ~1 à 2 m
  var NTF_T = [-168, -60, 320];
  function ntfToWgs(lat, lon) {
    var c = geoToCart(lat, lon, 0, ELL.CLARKE_IGN);
    return cartToGeo(c[0] + NTF_T[0], c[1] + NTF_T[1], c[2] + NTF_T[2], ELL.WGS84);
  }
  function wgsToNtf(lat, lon) {
    var c = geoToCart(lat, lon, 0, ELL.WGS84);
    return cartToGeo(c[0] - NTF_T[0], c[1] - NTF_T[1], c[2] - NTF_T[2], ELL.CLARKE_IGN);
  }

  // ---------- Lambert Conique Conforme ----------
  function lcc(o) {
    var E = o.ell, e = E.e, a = E.a;
    function m(p) { var s = Math.sin(p); return Math.cos(p) / Math.sqrt(1 - E.e2 * s * s); }
    function t(p) { var s = Math.sin(p); return Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - e * s) / (1 + e * s), e / 2); }
    var p0 = o.lat0 * D2R, p1 = (o.lat1 != null ? o.lat1 : o.lat0) * D2R, p2 = (o.lat2 != null ? o.lat2 : p1 * R2D) * D2R;
    var k0 = o.k0 || 1, n;
    if (Math.abs(p1 - p2) < 1e-12) n = Math.sin(p1);
    else n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(t(p1)) - Math.log(t(p2)));
    var F = m(p1) / (n * Math.pow(t(p1), n));
    var rho0 = a * F * k0 * Math.pow(t(p0), n);
    var lon0 = o.lon0;
    return {
      forward: function (lat, lon) {
        var rho = a * F * k0 * Math.pow(t(lat * D2R), n), th = n * (lon - lon0) * D2R;
        return { x: o.x0 + rho * Math.sin(th), y: o.y0 + rho0 - rho * Math.cos(th) };
      },
      inverse: function (x, y) {
        var dx = x - o.x0, dy = rho0 - (y - o.y0);
        var rho = Math.sqrt(dx * dx + dy * dy), th = Math.atan2(dx, dy);
        var tt = Math.pow(rho / (a * F * k0), 1 / n);
        var p = Math.PI / 2 - 2 * Math.atan(tt);
        for (var i = 0; i < 15; i++) {
          var s = Math.sin(p);
          p = Math.PI / 2 - 2 * Math.atan(tt * Math.pow((1 - e * s) / (1 + e * s), e / 2));
        }
        return { lat: p * R2D, lon: th / n * R2D + lon0 };
      }
    };
  }

  // ---------- Mercator Transverse (série de Krüger) ----------
  function tmerc(o) {
    var E = o.ell, f = E.f, n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
    var A = E.a / (1 + n) * (1 + n2 / 4 + n4 / 64);
    var al = [0, n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180, 13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440, 61 * n3 / 240 - 103 * n4 / 140, 49561 * n4 / 161280];
    var be = [0, n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360, n2 / 48 + n3 / 15 - 437 * n4 / 1440, 17 * n3 / 480 - 37 * n4 / 840, 4397 * n4 / 161280];
    var de = [0, 2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45, 7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45, 56 * n3 / 15 - 136 * n4 / 35, 4279 * n4 / 630];
    var e = E.e, k0 = o.k0, lon0 = o.lon0;
    return {
      forward: function (lat, lon) {
        var p = lat * D2R, dl = (lon - lon0) * D2R, s = Math.sin(p);
        var tt = Math.sinh(atanh(s) - e * atanh(e * s));
        var xi = Math.atan2(tt, Math.cos(dl)), eta = atanh(Math.sin(dl) / Math.sqrt(1 + tt * tt));
        var X = eta, Y = xi;
        for (var j = 1; j <= 4; j++) {
          X += al[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
          Y += al[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
        }
        return { x: o.x0 + k0 * A * X, y: o.y0 + k0 * A * Y };
      },
      inverse: function (x, y) {
        var xi = (y - o.y0) / (k0 * A), eta = (x - o.x0) / (k0 * A), xp = xi, ep = eta;
        for (var j = 1; j <= 4; j++) {
          xp -= be[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
          ep -= be[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
        }
        var chi = Math.asin(Math.sin(xp) / Math.cosh(ep)), p = chi;
        for (j = 1; j <= 4; j++) p += de[j] * Math.sin(2 * j * chi);
        return { lat: p * R2D, lon: lon0 + Math.atan2(Math.sinh(ep), Math.cos(xp)) * R2D };
      }
    };
  }
  function atanh(x) { return 0.5 * Math.log((1 + x) / (1 - x)); }

  // ---------- Définition des systèmes ----------
  var PARIS = 2.33722917; // méridien de Paris / Greenwich
  var SYSTEMS = [];
  function addProj(id, name, group, epsg, proj, datum, extra) {
    var s = { id: id, name: name, group: group, epsg: epsg, type: "proj", proj: proj, datum: datum || "RGF93" };
    for (var k in extra || {}) s[k] = extra[k];
    SYSTEMS.push(s);
  }
  SYSTEMS.push({ id: "wgs84", name: "WGS84 / RGF93 (GPS)", group: "Géographique", epsg: 4326, type: "geo" });
  addProj("l93", "Lambert 93", "France — RGF93", 2154,
    lcc({ ell: ELL.GRS80, lat0: 46.5, lat1: 49, lat2: 44, lon0: 3, x0: 700000, y0: 6600000 }));
  for (var z = 42; z <= 50; z++) {
    addProj("cc" + z, "CC" + z + " (Conique Conforme zone " + (z - 41) + ")", "France — RGF93", 3900 + z,
      lcc({ ell: ELL.GRS80, lat0: z, lat1: z - 0.75, lat2: z + 0.75, lon0: 3, x0: 1700000, y0: (z - 41) * 1000000 + 200000 }),
      "RGF93", { ccZone: z });
  }
  addProj("l2e", "Lambert II étendu", "France — NTF (ancien)", 27572,
    lcc({ ell: ELL.CLARKE_IGN, lat0: 46.8, k0: 0.99987742, lon0: PARIS, x0: 600000, y0: 2200000 }), "NTF");
  [["l1", "Lambert I carto (Nord)", 27571, 49.5, 0.99987734, 600000, 1200000],
   ["l2", "Lambert II carto (Centre)", 27572.1, 46.8, 0.99987742, 600000, 2200000],
   ["l3", "Lambert III carto (Sud)", 27573, 44.1, 0.99987750, 600000, 3200000],
   ["l4", "Lambert IV carto (Corse)", 27574, 42.165, 0.99994471, 234.358, 4185861.369]].forEach(function (d) {
    addProj(d[0], d[1], "France — NTF (ancien)", Math.floor(d[2]),
      lcc({ ell: ELL.CLARKE_IGN, lat0: d[3], k0: d[4], lon0: PARIS, x0: d[5], y0: d[6] }), "NTF");
  });
  SYSTEMS.push({ id: "utm", name: "UTM (WGS84)", group: "Monde", epsg: null, type: "utm" });
  addProj("webm", "Web Mercator (Google/OSM)", "Monde", 3857, {
    forward: function (lat, lon) { return { x: 6378137 * lon * D2R, y: 6378137 * Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2)) }; },
    inverse: function (x, y) { return { lat: (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * R2D, lon: x / 6378137 * R2D }; }
  }, "WGS84");

  function sys(id) { for (var i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].id === id) return SYSTEMS[i]; return null; }

  // ---------- UTM ----------
  var utmCache = {};
  function utmProj(zone, south) {
    var k = zone + (south ? "S" : "N");
    return utmCache[k] || (utmCache[k] = tmerc({ ell: ELL.WGS84, k0: 0.9996, lon0: zone * 6 - 183, x0: 500000, y0: south ? 10000000 : 0 }));
  }
  function utmZone(lat, lon) {
    var z = Math.floor((lon + 180) / 6) + 1;
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) z = 32;
    if (lat >= 72 && lat < 84) {
      if (lon >= 0 && lon < 9) z = 31; else if (lon >= 9 && lon < 21) z = 33;
      else if (lon >= 21 && lon < 33) z = 35; else if (lon >= 33 && lon < 42) z = 37;
    }
    return Math.min(60, Math.max(1, z));
  }
  function utmBand(lat) {
    if (lat < -80 || lat > 84) return "";
    return "CDEFGHJKLMNPQRSTUVWXX".charAt(Math.floor((lat + 80) / 8));
  }

  // ---------- API ----------
  // WGS84 -> système. opts.utmZone / opts.utmSouth facultatifs
  function fromWgs(id, lat, lon, opts) {
    var s = sys(id);
    if (!s) throw new Error("Système inconnu : " + id);
    if (s.type === "geo") return { lat: lat, lon: lon };
    if (s.type === "utm") {
      var zone = (opts && opts.utmZone) || utmZone(lat, lon);
      var south = opts && opts.utmSouth != null ? opts.utmSouth : lat < 0;
      var r = utmProj(zone, south).forward(lat, lon);
      return { x: r.x, y: r.y, zone: zone, south: south, band: utmBand(lat) };
    }
    if (s.datum === "NTF") { var g = wgsToNtf(lat, lon); return s.proj.forward(g.lat, g.lon); }
    return s.proj.forward(lat, lon);
  }
  // système -> WGS84
  function toWgs(id, a, b, opts) {
    var s = sys(id);
    if (!s) throw new Error("Système inconnu : " + id);
    if (s.type === "geo") return { lat: a, lon: b };
    if (s.type === "utm") {
      var r = utmProj(opts.utmZone, !!opts.utmSouth).inverse(a, b);
      return { lat: r.lat, lon: r.lon };
    }
    var g = s.proj.inverse(a, b);
    if (s.datum === "NTF") { var w = ntfToWgs(g.lat, g.lon); return { lat: w.lat, lon: w.lon }; }
    return g;
  }
  function bestCC(lat) { return Math.min(50, Math.max(42, Math.round(lat))); }
  function inFrance(lat, lon) { return lat > 41 && lat < 51.6 && lon > -5.8 && lon < 10; }

  // ---------- Formats d'angle ----------
  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }
  function toDMS(v, isLat, dec) {
    dec = dec == null ? 2 : dec;
    var h = isLat ? (v < 0 ? "S" : "N") : (v < 0 ? "O" : "E"), a = Math.abs(v);
    var d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), sec = (mf - m) * 60;
    var ss = sec.toFixed(dec);
    if (parseFloat(ss) >= 60) { ss = (0).toFixed(dec); m++; }
    if (m >= 60) { m -= 60; d++; }
    return d + "°" + pad(m, 2) + "'" + (parseFloat(ss) < 10 ? "0" : "") + ss + '" ' + h;
  }
  function toDDM(v, isLat, dec) {
    dec = dec == null ? 4 : dec;
    var h = isLat ? (v < 0 ? "S" : "N") : (v < 0 ? "O" : "E"), a = Math.abs(v);
    var d = Math.floor(a), m = ((a - d) * 60).toFixed(dec);
    if (parseFloat(m) >= 60) { d++; m = (0).toFixed(dec); }
    return d + "°" + (parseFloat(m) < 10 ? "0" : "") + m + "' " + h;
  }
  // Analyse d'un angle : "45.5", "-1,25", "45°30'12.5\"N", "N 45 30.25", "1d15m O"…
  function parseAngle(str) {
    if (str == null) return NaN;
    var s = String(str).trim().toUpperCase().replace(/(\d),(\d)/g, "$1.$2");
    if (!s) return NaN;
    var sign = 1;
    if (/[SWO]/.test(s.replace(/SEC/g, ""))) sign = -1;
    if (/^\s*-/.test(s)) sign = -1;
    var nums = s.match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length > 3) return NaN;
    var v = parseFloat(nums[0]) + (nums[1] ? parseFloat(nums[1]) / 60 : 0) + (nums[2] ? parseFloat(nums[2]) / 3600 : 0);
    if (nums[1] && parseFloat(nums[1]) >= 60) return NaN;
    if (nums[2] && parseFloat(nums[2]) >= 60) return NaN;
    return sign * v;
  }
  // Analyse d'un couple collé : "45.1, 5.7" / "45°10'N 5°42'E" / "N45 10.5 E5 42.1"
  function parsePair(str) {
    var s = String(str || "").trim().toUpperCase();
    if (!s) return null;
    var parts;
    if (/[NS]/.test(s) && /[EWO]/.test(s)) {
      // découpe autour des lettres
      var pre = s.match(/^\s*([NS])\s*([^EWO]+?)\s*[,;]?\s*([EWO])\s*(.+)$/);
      var suf = s.match(/^\s*(.+?)\s*([NS])\s*[,;]?\s*(.+?)\s*([EWO])\s*$/);
      if (pre) parts = [pre[1] + pre[2], pre[3] + pre[4]];
      else if (suf) parts = [suf[1] + suf[2], suf[3] + suf[4]];
    }
    if (!parts) {
      var t = s.replace(/(\d),(\d)/g, "$1.$2");
      if (/[;,]/.test(t)) parts = t.split(/\s*[;,]\s*/);
      else {
        var nums = t.match(/-?\d+(?:\.\d+)?/g) || [];
        if (nums.length === 2 || nums.length === 4 || nums.length === 6) {
          var h = nums.length / 2; parts = [nums.slice(0, h).join(" "), nums.slice(h).join(" ")];
          if (nums[h] && nums[h].charAt(0) === "-") parts[1] = "-" + parts[1].replace("-", "");
        }
      }
    }
    if (!parts || parts.length !== 2) return null;
    var lat = parseAngle(parts[0]), lon = parseAngle(parts[1]);
    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat: lat, lon: lon };
  }


  // ---------- MGRS ----------
  var MG_COL = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"], MG_ROW = "ABCDEFGHJKLMNPQRSTUV", BANDS = "CDEFGHJKLMNPQRSTUVWX";
  function toMGRS(lat, lon) {
    if (lat < -80 || lat >= 84) return null;
    var u = fromWgs("utm", lat, lon), set = ((u.zone - 1) % 6) + 1;
    var col = MG_COL[(set - 1) % 3].charAt(Math.floor(u.x / 100000) - 1);
    var row = MG_ROW.charAt((Math.floor(u.y / 100000) + (set % 2 === 0 ? 5 : 0)) % 20);
    var e = Math.floor(u.x % 100000), n = Math.floor(u.y % 100000);
    return { zone: u.zone, band: u.band, sq: col + row, e: pad(e, 5), n: pad(n, 5) };
  }
  function fromMGRS(zone, band, sq, e, n) {
    zone = +zone; band = String(band || "").toUpperCase(); sq = String(sq || "").toUpperCase();
    if (!(zone >= 1 && zone <= 60) || BANDS.indexOf(band) < 0 || sq.length !== 2) throw new Error("MGRS invalide");
    var set = ((zone - 1) % 6) + 1, ci = MG_COL[(set - 1) % 3].indexOf(sq.charAt(0)), ri = MG_ROW.indexOf(sq.charAt(1));
    if (ci < 0 || ri < 0) throw new Error("Carré de 100 km invalide");
    e = String(e || "0"); n = String(n || "0");
    if (!/^\d{1,5}$/.test(e) || !/^\d{1,5}$/.test(n) || e.length !== n.length) throw new Error("Est/Nord MGRS : même nombre de chiffres (1 à 5)");
    var f = Math.pow(10, 5 - e.length);
    var E = (ci + 1) * 100000 + (+e) * f + f / 2 * (f > 1 ? 1 : 0);
    var N = ((ri - (set % 2 === 0 ? 5 : 0) + 20) % 20) * 100000 + (+n) * f + f / 2 * (f > 1 ? 1 : 0);
    var bi = BANDS.indexOf(band), south = bi < 10, latMin = -80 + bi * 8;
    var proj = utmProj(zone, south);
    var minN = proj.forward(latMin, zone * 6 - 183).y - 100000;
    while (N < minN) N += 2000000;
    var g = proj.inverse(E, N);
    return { lat: g.lat, lon: g.lon };
  }
  function parseMGRS(str) {
    var m = String(str || "").toUpperCase().replace(/\s+/g, "").match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d*)$/);
    if (!m || m[4].length % 2) return null;
    var h = m[4].length / 2;
    return fromMGRS(m[1], m[2], m[3], m[4].slice(0, h) || "0", m[4].slice(h) || "0");
  }

  // ---------- Plus Code (Open Location Code) ----------
  var OLC = "23456789CFGHJMPQRVWX";
  function toPlusCode(lat, lon) {
    lat = Math.min(90 - 1e-10, Math.max(-90, lat)); lon = ((lon + 180) % 360 + 360) % 360 - 180;
    var la = Math.floor(Math.round((lat + 90) * 40000 * 1e6) / 1e6), lo = Math.floor(Math.round((lon + 180) * 32000 * 1e6) / 1e6);
    var grid = OLC.charAt((la % 5) * 4 + (lo % 4));
    la = Math.floor(la / 5); lo = Math.floor(lo / 4);
    var pairs = "";
    for (var i = 0; i < 5; i++) { pairs = OLC.charAt(la % 20) + OLC.charAt(lo % 20) + pairs; la = Math.floor(la / 20); lo = Math.floor(lo / 20); }
    return pairs.slice(0, 8) + "+" + pairs.slice(8) + grid;
  }
  function fromPlusCode(code) {
    var c = String(code || "").toUpperCase().replace(/\s/g, "");
    if (!/^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{0,7}$/.test(c)) throw new Error("Plus Code complet attendu (ex. 8FQ6QRMH+4M)");
    c = c.replace("+", "");
    var lat = -90, lon = -180, rl = 400, ro = 400;
    for (var i = 0; i < Math.min(10, c.length); i += 2) {
      rl /= 20; ro /= 20;
      lat += OLC.indexOf(c.charAt(i)) * rl; lon += OLC.indexOf(c.charAt(i + 1)) * ro;
    }
    for (i = 10; i < c.length; i++) {
      rl /= 5; ro /= 4; var d = OLC.indexOf(c.charAt(i));
      lat += Math.floor(d / 4) * rl; lon += (d % 4) * ro;
    }
    return { lat: lat + rl / 2, lon: lon + ro / 2 };
  }

  function parseNum(v) {
    if (typeof v === "number") return v;
    var s = String(v || "").replace(/\s/g, "").replace(",", ".");
    return s === "" ? NaN : Number(s);
  }

  var Geo = {
    SYSTEMS: SYSTEMS, sys: sys, fromWgs: fromWgs, toWgs: toWgs, utmZone: utmZone, utmBand: utmBand,
    bestCC: bestCC, inFrance: inFrance, toDMS: toDMS, toDDM: toDDM, parseAngle: parseAngle,
    parsePair: parsePair, parseNum: parseNum,
    toMGRS: toMGRS, fromMGRS: fromMGRS, parseMGRS: parseMGRS, toPlusCode: toPlusCode, fromPlusCode: fromPlusCode
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Geo; else root.Geo = Geo;
})(this);
