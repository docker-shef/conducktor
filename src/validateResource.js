const { log } = require("../config/config.js");

const validateResourceMW = (resourceSchema) => async (req, res, next) => {
    const resource = req.body;
    try {
        await resourceSchema.validate(resource);
        next();
    } catch (e) {
        log.error(e);
        res.status(400).json({ error: e.errors.join(', ') });
    }
};

module.exports = { validateResourceMW };