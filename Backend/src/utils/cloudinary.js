import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config(
    {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME ,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET 
    }
);

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
            folder: "shop-app" // optional but recommended — keeps your Cloudinary media organized
        });

        fs.unlinkSync(localFilePath); // clean up local file after successful upload
        return response;
    } catch (error) {
        fs.unlinkSync(localFilePath); // clean up on failure too
        return null;
    }
};

// utils/cloudinary.js  (add this function to the existing file)
const deleteFromCloudinary = async (publicId) => {
    try {
        if (!publicId) return null;
        const response = await cloudinary.uploader.destroy(publicId);
        return response;
    } catch (error) {
        return null;
    }
};

export { uploadOnCloudinary, deleteFromCloudinary };