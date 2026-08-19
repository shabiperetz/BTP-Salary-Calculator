/*
 * מייצר את assets/og-day.png — תמונת התצוגה המקדימה (Open Graph) של
 * day-transition.html.
 *
 * הרקע הוא אותו גרדיאנט של כרטיס ההירו, והסמל מ-assets/emblem.png מורכב
 * עליו במרכז. אין טקסט בתמונה: הכותרת והתיאור מגיעים ממטא-תגיות og,
 * והרשת מציגה אותם כטקסט לצד התמונה. כך התמונה נשארת נכונה לכל עמוד
 * ולא נושאת שם מוצר שגוי.
 *
 *   node build-og.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var zlib = require("zlib");

var SRC = path.join(__dirname, "assets", "emblem.png");
var OUT = path.join(__dirname, "assets", "og-day.png");

var W = 1200, H = 630;
var HERO_A = [0x8f, 0x1d, 0x14];   // אדום כהה — הפינה הימנית העליונה
var HERO_B = [0xc2, 0x41, 0x0c];   // כתום — הפינה השמאלית התחתונה

/* ===== CRC32, לפי מפרט PNG ===== */
var CRC_TABLE = (function(){
  var t = new Int32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf){
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ===== קריאת PNG: פירוק לצ'אנקים, פרישׂת IDAT, וביטול הפילטרים ===== */
function readPng(file){
  var buf = fs.readFileSync(file);
  var sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (var s = 0; s < 8; s++) {
    if (buf[s] !== sig[s]) throw new Error("לא קובץ PNG: " + file);
  }

  var pos = 8, idat = [], ihdr = null;
  while (pos < buf.length) {
    var len  = buf.readUInt32BE(pos);
    var type = buf.toString("ascii", pos + 4, pos + 8);
    var data = buf.slice(pos + 8, pos + 8 + len);
    if (type === "IHDR") ihdr = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error("חסר IHDR");

  var w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  var depth = ihdr[8], color = ihdr[9], interlace = ihdr[12];
  if (depth !== 8) throw new Error("נתמך רק עומק 8 ביט, התקבל " + depth);
  if (interlace !== 0) throw new Error("PNG משולב (interlaced) אינו נתמך");
  if (color !== 6 && color !== 2) throw new Error("נתמך רק RGB/RGBA, color type " + color);

  var ch = (color === 6) ? 4 : 3;
  var raw = zlib.inflateSync(Buffer.concat(idat));
  var out = Buffer.alloc(w * h * 4);
  var stride = w * ch;
  var prev = Buffer.alloc(stride);
  var rp = 0;

  for (var y = 0; y < h; y++) {
    var filter = raw[rp++];
    var line = Buffer.from(raw.slice(rp, rp + stride));
    rp += stride;

    for (var i = 0; i < stride; i++) {
      var a = (i >= ch) ? line[i - ch] : 0;
      var b = prev[i];
      var c = (i >= ch) ? prev[i - ch] : 0;
      var v = line[i];
      if (filter === 1) v = v + a;
      else if (filter === 2) v = v + b;
      else if (filter === 3) v = v + ((a + b) >> 1);
      else if (filter === 4) {
        var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = v + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c));
      }
      line[i] = v & 0xff;
    }
    prev = line;

    for (var x = 0; x < w; x++) {
      var si = x * ch, di = (y * w + x) * 4;
      out[di]     = line[si];
      out[di + 1] = line[si + 1];
      out[di + 2] = line[si + 2];
      out[di + 3] = (ch === 4) ? line[si + 3] : 255;
    }
  }
  return { width: w, height: h, data: out };
}

/* ===== כתיבת PNG בצבע RGB, ללא שקיפות ===== */
function writePng(file, w, h, rgb){
  function chunk(type, data){
    var len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    var td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    var crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  }

  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // עומק ביט
  ihdr[9] = 2;    // RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // כל שורה מקבלת בית פילטר 0 (None) — הגרדיאנט נדחס היטב גם כך
  var stride = w * 3;
  var raw = Buffer.alloc(h * (stride + 1));
  for (var y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  var png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}

/* ===== דגימה דו-לינארית מתוך תמונת RGBA ===== */
function sample(img, fx, fy){
  var x0 = Math.floor(fx), y0 = Math.floor(fy);
  var x1 = Math.min(x0 + 1, img.width - 1), y1 = Math.min(y0 + 1, img.height - 1);
  x0 = Math.max(0, Math.min(x0, img.width - 1));
  y0 = Math.max(0, Math.min(y0, img.height - 1));
  var dx = fx - x0, dy = fy - y0;
  var out = [0, 0, 0, 0];

  for (var c = 0; c < 4; c++) {
    var p00 = img.data[(y0 * img.width + x0) * 4 + c];
    var p10 = img.data[(y0 * img.width + x1) * 4 + c];
    var p01 = img.data[(y1 * img.width + x0) * 4 + c];
    var p11 = img.data[(y1 * img.width + x1) * 4 + c];
    out[c] = p00 * (1 - dx) * (1 - dy) + p10 * dx * (1 - dy) + p01 * (1 - dx) * dy + p11 * dx * dy;
  }
  return out;
}

/* ===== הרכבה ===== */
var emblem = readPng(SRC);
var canvas = Buffer.alloc(W * H * 3);

/* גרדיאנט אלכסוני: הטלה על הציר מהפינה הימנית-עליונה לשמאלית-תחתונה */
for (var y = 0; y < H; y++) {
  for (var x = 0; x < W; x++) {
    var t = ((W - x) / W + y / H) / 2;   // 0 בפינה הימנית-עליונה, 1 בשמאלית-תחתונה
    var di = (y * W + x) * 3;
    canvas[di]     = Math.round(HERO_A[0] + (HERO_B[0] - HERO_A[0]) * t);
    canvas[di + 1] = Math.round(HERO_A[1] + (HERO_B[1] - HERO_A[1]) * t);
    canvas[di + 2] = Math.round(HERO_A[2] + (HERO_B[2] - HERO_A[2]) * t);
  }
}

/* הסמל במרכז, בגובה 46% מהתמונה */
var S = Math.round(H * 0.46);
var ox = Math.round((W - S) / 2), oy = Math.round((H - S) / 2);

for (var sy = 0; sy < S; sy++) {
  for (var sx = 0; sx < S; sx++) {
    var px = sample(emblem, sx / S * (emblem.width - 1), sy / S * (emblem.height - 1));
    var alpha = px[3] / 255;
    if (alpha <= 0) continue;
    var ci = ((oy + sy) * W + (ox + sx)) * 3;
    canvas[ci]     = Math.round(canvas[ci]     * (1 - alpha) + px[0] * alpha);
    canvas[ci + 1] = Math.round(canvas[ci + 1] * (1 - alpha) + px[1] * alpha);
    canvas[ci + 2] = Math.round(canvas[ci + 2] * (1 - alpha) + px[2] * alpha);
  }
}

var bytes = writePng(OUT, W, H, canvas);
console.log("assets/og-day.png נוצר — " + W + "×" + H + ", " + bytes + " בתים (סמל: " +
            emblem.width + "×" + emblem.height + ")");
