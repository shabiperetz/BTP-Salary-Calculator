/*
 * מייצר את share.html מתוך index.html.
 *
 * share.html היא גרסת הארטיפקט של Claude: הפלטפורמה עוטפת את הקובץ
 * בשלד <!doctype html><head></head><body> משלה, ולכן אסור שיהיו בו
 * תגיות מסמך חיצוניות. אותו מנוע חישוב, מקור אחד — index.html.
 *
 *   node build-share.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var SRC = path.join(__dirname, "index.html");
var OUT = path.join(__dirname, "share.html");

var html = fs.readFileSync(SRC, "utf8");

// תגיות מסמך שהפלטפורמה מספקת בעצמה
var STRIP = [
  /^<!DOCTYPE html>\s*/i,
  /^<html[^>]*>\s*/i,
  /^<head>\s*/i,
  /^<meta[^>]*>\s*/i,
  /^<\/head>\s*/i,
  /^<body>\s*/i,
  /^<\/body>\s*/i,
  /^<\/html>\s*/i
];

var out = html
  .split("\n")
  .filter(function(line){
    return !STRIP.some(function(re){ return re.test(line.trim()); });
  })
  .join("\n")
  .trim();

// בארטיפקט אין קבצים אחיים — הקישור לסימולטור המעבר ליום חייב להיות מוחלט
var SITE = "https://shabiperetz.github.io/BTP-Salary-Calculator/";
out = out.replace(/href="day-transition\.html"/g,
  "href=\"" + SITE + "day-transition.html\" target=\"_blank\" rel=\"noopener\"");

var banner = "<!-- נוצר אוטומטית מ-index.html על ידי build-share.js — אין לערוך ידנית. -->";
out = out.replace(/(<title>[\s\S]*?<\/title>)/, "$1\n" + banner) + "\n";

// בדיקת שפיות: אסור שיישארו תגיות מסמך, וחייב להישאר מנוע החישוב
var leftovers = out.match(/<\/?(?:html|head|body|!DOCTYPE)\b[^>]*>/gi);
if (leftovers) {
  console.error("שגיאה: נותרו תגיות מסמך — " + leftovers.join(", "));
  process.exit(1);
}
["<title>", "MONTHLY_STANDARD", "MONTHLY_AVG_HOURS", "seniorityFactor", "FUND_EMPLOYEE"].forEach(function(needle){
  if (out.indexOf(needle) === -1) {
    console.error("שגיאה: חסר בפלט — " + needle);
    process.exit(1);
  }
});

fs.writeFileSync(OUT, out, "utf8");
console.log("share.html נוצר — " + out.length + " תווים (מקור: " + html.length + ")");
