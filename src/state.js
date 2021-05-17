const { log } = require("../config/config.js");
const client = require("./redis-client");
const axios = require("axios");
const _ = require("lodash");
const schedule = require("./schedule");

const getAllServices = async () => {
    let service_map = [];
    let serviceKeys = await client.keysAsync("service.*");
    for (const serviceKey of serviceKeys) {
        serviceValue = JSON.parse(await client.getAsync(serviceKey));
        service_map.push(serviceValue);
    }
    return service_map;
}

const getAllNode = async () => {
    let nodes_map = [];
    let nodeKeys = await client.keysAsync("node.*");
    for (const nodeKey of nodeKeys) {
        nodeValue = JSON.parse(await client.getAsync(nodeKey));
        nodes_map.push(nodeValue);
    }
    return nodes_map;
}

const getAllRunners = async (which = "alive") => {
    let runner_map = [];
    let runnerKeys = await client.keysAsync("runner.*");
    for (const runnerKey of runnerKeys) {
        runnerValue = JSON.parse(await client.getAsync(runnerKey));
        if (runnerValue.alive && which === "alive") {
            runner_map.push(runnerValue);
        } else if (!runnerValue.alive && which === "failed") {
            runner_map.push(runnerValue);
        } else if (which === "all") {
            runner_map.push(runnerValue);
        }
    }
    return runner_map;
}

const checkRunners = async () => {
    let runner_map = await getAllRunners("alive");
    for (const runner of runner_map) {
        let breakLoop = false;
        await axios.get("http://" + runner.runnerName + ":11044/health").catch(async (err) => {
            log.info(`Something wrong with runner.${runner.runnerName}. Migrating containers!`);
            runner.alive = false;
            await client.setAsync("runner." + runner.runnerName, JSON.stringify(runner));
            if (runner_map.length <= 1) {
                log.info(`Something wrong with runner.${runner.runnerName} and there is no alive runner. Will wait for active runners to migrate services.`);
                breakLoop = true;
            }
            if (runner_map.length > 1 && !_.isEmpty(runner.containers)) {
                await schedule.migrateRunnerContainers(runner.runnerName);
                runner.containers = [];
                await client.setAsync("runner." + runner.runnerName, JSON.stringify(runner));
            }
        });
        if (breakLoop) break;
    }
    let aliveRunner_map = await getAllRunners("alive");
    runner_map = await getAllRunners("failed");
    for (const runner of runner_map) {
        if (_.isEmpty(runner.containers)) continue;
        let breakLoop = false;
        await axios.get("http://" + runner.runnerName + ":11044/health").then(async res => {
            runner.alive = true;
            await client.setAsync("runner." + runner.runnerName, JSON.stringify(runner));
        }).catch(async (err) => {
            if (aliveRunner_map.length > 1 && !_.isEmpty(runner.containers)) {
                log.info(`Migrating containers from dead runner runner.${runner.runnerName} to alive ones.`);
                await schedule.migrateRunnerContainers(runner.runnerName);
                runner.containers = [];
                await client.setAsync("runner." + runner.runnerName, JSON.stringify(runner));
            } else {
                log.info(`Still waiting for active runners to migrate containers from runner.${runner.runnerName}.`);
            }
        });
        if (breakLoop) break;
    }
}

const checkBouters = async () => {
    let nodes = await getAllNode();
    for (const node of nodes) {
        if (node.alive) {
            let nodeTime = new Date(node.lastAlive);
            let time = new Date();
            if ((Math.floor((time.getTime() - nodeTime.getTime()) / 1000)) > 90) {
                node.alive = false
                client.setAsync("node." + node.node, JSON.stringify(node));
            }
        }
    }

}

module.exports = { getAllServices, getAllNode, checkRunners, checkBouters, getAllRunners };