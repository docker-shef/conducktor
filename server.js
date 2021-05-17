#!/usr/bin/env node
'use strict'

const { log } = require("./config/config.js");
const express = require("express");
const schema = require("./src/validators");
const { validateResourceMW } = require("./src/validateResource");
const state = require("./src/state");
const schedule = require("./src/schedule");

log.info("Log level:", global.gConfig.LOG_LEVEL);

initConducktor().catch(e => log.error(e));

async function initConducktor() {
    try {
        log.info("Starting shef Conducktor.");

        const client = require("./src/redis-client");
        await client.onAsync("ready").then(() => log.info("Redis connected."));

        await state.checkBouters();

        const app = express();
        app.use(express.json());

        app.get("/", (req, res) => {
            return res.status(200).send("Hello world");
        });

        app.get("/service", validateResourceMW(schema.getServiceSchema), async (req, res) => {
            try {
                const service = schema.getServiceSchema.cast(req.body);
                let getRes = await schedule.getService(service);
                log.debug(JSON.stringify(getRes));
                res.json(getRes);
            } catch (err) {
                log.error(err);
                res.status(404).json({ error: err });
            }
        });

        app.post("/service", validateResourceMW(schema.createServiceSchema), async (req, res) => {
            try {
                const service = schema.createServiceSchema.cast(req.body);
                let createRes = await schedule.createService(service);
                log.info(`Creating service ${service.serviceName}`);
                log.debug(JSON.stringify(createRes));
                res.json(createRes);
            } catch (err) {
                log.error(err);
                res.status(409).json({ error: err });
            }
        });

        app.put("/service", validateResourceMW(schema.updateServiceSchema), async (req, res) => {
            try {
                const service = schema.updateServiceSchema.cast(req.body);
                let updateRes = await schedule.updateService(service);
                log.debug(JSON.stringify(updateRes));
                res.json(updateRes);
            } catch (err) {
                log.error(err);
                res.status(409).json({ error: err });
            }
        });

        app.delete("/service", validateResourceMW(schema.getServiceSchema), async (req, res) => {
            try {
                const service = schema.getServiceSchema.cast(req.body);
                let deleteRes = await schedule.deleteService(service);
                log.debug(JSON.stringify(deleteRes));
                res.json(deleteRes);
            } catch (err) {
                log.error(err);
                res.status(409).json({ error: err });
            }
        });

        app.get("/state", async (req, res) => {
            try {
                let services = await state.getAllServices();
                let nodes = await state.getAllNode();
                let runners = await state.getAllRunners("all");
                log.debug(JSON.stringify({ nodes: nodes, runners: runners, services: services }));
                res.json({ nodes: nodes, runners: runners, services: services });
            } catch (err) {
                log.error(err);
                res.status(404).json({ error: err });
            }
        });

        app.get("/runner", validateResourceMW(schema.getRunnerSchema), async (req, res) => {
            const reqRunner = schema.getRunnerSchema.cast(req.body);
            let runner = await client.getAsync("runner." + reqRunner.runnerName);
            if (runner !== null) {
                res.json(JSON.parse(runner));
            } else {
                res.status(404).json({ error: "No runner in this name." });
            }
        });

        app.post("/runner", validateResourceMW(schema.runnerSchema), async (req, res) => {
            const runner = schema.runnerSchema.cast(req.body);
            await client.setAsync("runner." + runner.runnerName, JSON.stringify(runner));
            res.json({ OK: true });
        });

        app.post("/node", validateResourceMW(schema.nodesSchema), async (req, res) => {
            const node = schema.nodesSchema.cast(req.body);
            await client.setAsync("node." + node.node, JSON.stringify(node));
            res.json({ OK: true });
        });

        app.listen(global.gConfig.PORT, () => {
            log.info(`Server listening on port ${global.gConfig.PORT}`);
        });

        setInterval(async () => {
            try {
                log.debug("Scheduled runner and bouter checks!");
                await state.checkRunners();
                await state.checkBouters();
            } catch (err) {
                log.fatal("Something wrong.", err);
            }
        }, 20000);
    } catch (err) {
        throw log.fatal(err);
    }
}
