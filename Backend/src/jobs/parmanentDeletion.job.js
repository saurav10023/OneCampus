// jobs/permanentDeletion.job.js
import { User } from "../models/user.model.js";
import { ACCOUNT_DELETION_GRACE_DAYS } from "../utils/constants.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Permanently deletes accounts soft-deleted at least ACCOUNT_DELETION_GRACE_DAYS ago.
const runPermanentDeletion = async () => {
    const cutoff = new Date(Date.now() - ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);

    const candidates = await User.find({
        isDeleted: true,
        deletedAt: { $lte: cutoff }
    })
        .select("_id")
        .lean();

    let deletedCount = 0;

    for (const { _id } of candidates) {
        // Re-check the state inside the delete itself, so an account restored
        // after the find() above is never removed.
        const result = await User.deleteOne({
            _id,
            isDeleted: true,
            deletedAt: { $lte: cutoff }
        });

        if (result.deletedCount === 1) {
            deletedCount++;
            // TODO: handle related records here once the data-retention policy is decided.
        }
    }

    return deletedCount;
};

// Call once from index.js after the database is connected.
// Single-instance only; use node-cron or a platform scheduler if you run several servers.
const startPermanentDeletionJob = () => {
    const tick = async () => {
        try {
            const count = await runPermanentDeletion();
            if (count > 0) console.log(`Permanent deletion job: removed ${count} account(s)`);
        } catch (error) {
            console.error("Permanent deletion job failed:", error.message);
        }
    };

    tick();
    const timer = setInterval(tick, DAY_MS);
    timer.unref(); // don't keep the process alive just for this timer
    return timer;
};

export { runPermanentDeletion, startPermanentDeletionJob };