#!/usr/bin/env node
'use strict'

const { log } = require("./config/config.js");
const express = require("express");
const { createServiceSchema, getServiceSchema, updateServiceSchema, runnerSchema } = require("./src/validators");
const { validateResourceMW } = require("./src/validateResource");
const { createService } = require("./src/schedule");

log.info("Log level:", global.gConfig.LOG_LEVEL);

initConducktor().catch(e => log.error(e));

async function initConducktor() {
    try {
        log.info("Starting shef Conducktor.");
        

        const client = require("./src/redis-client");
        await client.onAsync("ready").then(() => log.info("Redis connected."));

        const app = express();
        app.use(express.json());

        app.get("/", (req, res) => {
            return res.status(200).send("Hello world");
        });

        app.get("/service", validateResourceMW(getServiceSchema), (req, res) => {
            const service = getServiceSchema.cast(req.body);
            log.debug(JSON.stringify(service));
            res.json(service);
        });

        app.post("/service", validateResourceMW(createServiceSchema), async (req, res) => {
            try {
                const service = createServiceSchema.cast(req.body);
                let createRes = await createService(service);
                log.debug(JSON.stringify(createRes));
                res.json(createRes);
            } catch (e) {
                log.error(e);
                res.status(400).json({ error: e });
            }
        });

        app.put("/service", validateResourceMW(updateServiceSchema), (req, res) => {
            const service = updateServiceSchema.cast(req.body);
            log.debug(JSON.stringify(service));
            res.json(service);
        });

        app.delete("/service", validateResourceMW(getServiceSchema), (req, res) => {
            const service = getServiceSchema.cast(req.body);
            log.debug(JSON.stringify(service));
            res.json(service);
        });

        app.post("/runner", validateResourceMW(runnerSchema), async (req, res) => {
            const runner = runnerSchema.cast(req.body);
            await client.setAsync("runner."+runner.runnerName, JSON.stringify(runner));
            log.debug(JSON.stringify(runner));
            res.send("OK");
        });

        app.get("/container", validateResourceMW(runnerSchema), async (req, res) => {
            const runner = runnerSchema.cast(req.body);
            await client.setAsync("runner."+runner.runnerName, JSON.stringify(runner));
            log.debug(JSON.stringify(runner));
            res.send("OK");
        });

        app.post("/container", validateResourceMW(runnerSchema), async (req, res) => {
            const runner = runnerSchema.cast(req.body);
            await client.setAsync("runner."+runner.runnerName, JSON.stringify(runner));
            log.debug(JSON.stringify(runner));
            res.send("OK");
        });

        app.listen(global.gConfig.PORT, () => {
            log.info(`Server listening on port ${global.gConfig.PORT}`);
        });
    } catch (err) {
        throw log.fatal(err);
    }
}
