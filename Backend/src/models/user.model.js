// models/user.model.js
import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
    BRANCHES,
    DEFAULT_COLLEGE,
    SECTIONS,
    SESSION_DAYS,
    USER_ROLES
} from "../utils/constants.js";

// Accepts +91 / 91 / 0 prefixes and separators; always stores plain 10 digits.
// Exported so controllers normalize login/uniqueness queries the same way.
const normalizeMobile = (value) => {
    if (typeof value !== "string") return value;
    const digits = value.trim().replace(/[\s\-()]/g, "");
    if (/^\+91\d{10}$/.test(digits)) return digits.slice(3);
    if (/^91\d{10}$/.test(digits)) return digits.slice(2);
    if (/^0\d{10}$/.test(digits)) return digits.slice(1);
    return digits;
};

const userSchema = new Schema(
    {
        // ---- Account and profile ----
        fullName: {
            type: String,
            required: [true, "Full name is required"],
            trim: true
        },
        username: {
            type: String,
            required: [true, "Username is required"],
            trim: true,
            lowercase: true,
            unique: true,
            match: [
                /^(?!\d+$)[a-z0-9_.]{3,20}$/,
                "Username must be 3-20 characters: letters, numbers, underscores and periods only, not only digits"
            ]
        },
        mobile: {
            type: String,
            required: [true, "Mobile number is required"],
            unique: true,
            set: normalizeMobile,
            validate: {
                validator: (value) => /^[6-9]\d{9}$/.test(value),
                message: "Please provide a valid Indian mobile number"
            }
        },
        // Optional, recovery only. Left undefined (not "" or null) when absent so
        // the partial unique index below ignores it.
        email: {
            type: String,
            trim: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"]
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [8, "Password must be at least 8 characters"],
            select: false
        },
        // TODO (lifecycle Section 3): replace `college` with a required `collegeId` and read the
        // branch and section lists from CollegeAcademicConfig instead of the placeholder
        // BRANCHES / SECTIONS constants. Until then these three fields stay as they are.
        college: {
            type: String,
            required: [true, "College is required"],
            trim: true,
            default: DEFAULT_COLLEGE
        },
        branch: {
            type: String,
            required: [true, "Branch is required"],
            trim: true,
            enum: { values: BRANCHES, message: "{VALUE} is not a valid branch" }
        },
        section: {
            type: String,
            required: [true, "Section is required"],
            trim: true,
            enum: { values: SECTIONS, message: "{VALUE} is not a valid section" }
        },
        rollNo: {
            type: String,
            trim: true,
            default: null
        },
        avatar: {
            type: String,
            trim: true,
            default: "",
            match: [/^https?:\/\/\S+$/, "Avatar must be a valid http(s) URL"]
        },
        avatarPublicId: { type: String, default: "", select: false },

        // ---- Setup pointer ----
        // The setup the app opens by default. A convenience pointer only: the setup itself is the
        // source of truth. Set when a setup is created or chosen, cleared when it is archived or
        // deleted. Without this field Mongoose silently drops every update to it.
        activeSetupId: {
            type: Schema.Types.ObjectId,
            ref: "Setup",
            default: null
        },

        // ---- Role and account status ----
        // Account-level role. The per-class permission (CR or admin of a section or college)
        // lives in ScheduleRole, not here.
        role: {
            type: String,
            required: true,
            enum: { values: USER_ROLES, message: "{VALUE} is not a valid role" },
            default: "student"
        },
        isActive: {
            type: Boolean,
            required: true,
            default: true
        },
        isDeleted: {
            type: Boolean,
            required: true,
            default: false
        },
        deletedAt: {
            type: Date,
            default: null
        },
        lastLoginAt: {
            type: Date,
            default: null
        },

        // Internal: set on password change/reset so older tokens stop working.
        passwordChangedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

// Unique only among accounts that actually have an email.
userSchema.index(
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);

// Speeds up the permanent-deletion job.
userSchema.index({ isDeleted: 1, deletedAt: 1 });

// Never leak internal fields in API responses.
userSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.passwordChangedAt;
        delete ret.__v;
        delete ret.avatarPublicId;
        return ret;
    }
});

// Validation (minlength) runs on the plain password before this hook hashes it.
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        { _id: this._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: `${SESSION_DAYS}d` }
    );
};

export  const User = mongoose.model("User", userSchema);
export { normalizeMobile };