import multer from "multer";
import fs from "fs";
import path from "path";
import { ApiError } from "../utils/ApiError.js";

const TEMP_DIR = "./public/temp";
fs.mkdirSync(TEMP_DIR, { recursive: true });

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const multerUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, TEMP_DIR),
        filename: (req, file, cb) =>
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
    }),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) =>
        ALLOWED.includes(file.mimetype)
            ? cb(null, true)
            : cb(new ApiError(400, "Only JPG, PNG or WebP images are allowed"))
});

// Optional file in the field "avatar". JSON requests pass straight through.
export const uploadAvatar = (req, res, next) => {
    multerUpload.single("avatar")(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
            return next(new ApiError(400,
                err.code === "LIMIT_FILE_SIZE"
                    ? "Image must be 2 MB or smaller"
                    : "Invalid upload. Send one file in the field 'avatar'"));
        }
        next(err);
    });
};