const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
const { Parser } = require("json2csv");

const { engine } = require("express-handlebars");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname + "/public"));

app.engine("handlebars", engine());
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

async function search(filePath, conditions) {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const isMatch = conditions.every(({ key, pattern }) => {
          if (Array.isArray(pattern)) {
            return pattern.some((p) => new RegExp(p, "i").test(row[key]));
          } else {
            const regex = new RegExp(pattern, "i");
            return regex.test(row[key]);
          }
        });

        if (isMatch) {
          results.push(row);
        }
      })
      .on("end", () => {
        resolve(results);
      })
      .on("error", (error) => reject(error));
  });
}

app.get("/", (req, res) => {
  res.render("home");
});
app.post("/", upload.array("files", 10), (req, res) => {
  const bank = req.body.bank;
  const level = req.body.level;
  const type = req.body.type;
  const vendor = req.body.vendor;
  const country = req.body.country;
  let bins = req.body.bins
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map(Number)
    .filter((num) => !isNaN(num));
  if (bins.length === 0) {
    bins = undefined;
  }
  const conditions = [
    { key: "Category", pattern: level },
    { key: "Issuer", pattern: bank },
    { key: "Type", pattern: type },
    { key: "Brand", pattern: vendor },
    { key: "CountryName", pattern: country },
    { key: "BIN", pattern: bins },
  ];
  search("./bin-list-data.csv", conditions)
    .then((jsonData) => {
      if (req.files && req.files.length > 0) {
        let combinedData = ""; // Chuỗi để chứa nội dung của tất cả các file

       req.files.forEach((file) => {
          // file.buffer contains the file data in memory
          const fileData = file.buffer.toString("utf8");

          // Append the file data to combinedData string
          combinedData += fileData + "\n";
        });

        // const filePath = path.join(__dirname, req.file.path);

        // fs.readFile(filePath, "utf8", (err, data) => {
        //   if (err) {
        //     return res.status(500).send("Failed to read file.");
        //   }

        const lines = combinedData.split("\n");
        const binMap = new Map();

        lines.forEach((line) => {
          const parts = line.trim().split(/\s+/);

          if (parts.length > 1) {
            const bin = parts[0];
            const quantity = parseInt(parts[1]);

            if (binMap.has(bin)) {
              binMap.set(bin, binMap.get(bin) + quantity);
            } else {
              binMap.set(bin, quantity);
            }
          }
        });

        const results = Array.from(binMap, ([bin, quantity]) => ({
          bin,
          quantity,
        }));
        const foundBinsInfo = results
          .filter((inputBin) => {
            const entry = jsonData.find((entry) => entry.BIN === inputBin.bin);
            return entry;
          })
          .map((inputBin) => {
            const entry = jsonData.find((entry) => entry.BIN === inputBin.bin);
            return {
              quantity: inputBin.quantity,
              ...entry,
            };
          });
        res.render("home", { data: foundBinsInfo, quantity: true });

        // fs.unlink(filePath, (err) => {
        //   if (err) console.error("Failed to delete file:", err);
        // });
        // });
      } else {
        res.render("home", { data: jsonData, quantity: false });
      }
    })
    .catch((error) => {
      console.error("Lỗi khi tìm kiếm trong file CSV:", error);
    });
});

app.listen(3000);
