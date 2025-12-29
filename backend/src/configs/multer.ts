import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Helper to create folder if it doesn't exist
const ensureFolder = (folder: string) => {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
};

// Storage for students
ensureFolder('uploads/students');
const studentStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/students'),
  filename: (_, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Storage for counselors
ensureFolder('uploads/counselors');
const counselorStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/counselors'),
  filename: (_, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// File filter for images only
const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};

// Multer upload instances
export const studentUpload = multer({
  storage: studentStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export const counselorUpload = multer({
  storage: counselorStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
