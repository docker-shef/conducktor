const { log } = require("../config/config.js");
const client = require("./redis-client");
const axios = require("axios");
const _ = require("lodash");
const { migrateRunnerContainers } = require("./schedule");
const moment = require('moment')

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

const getAllRunners = async () => {
    let runner_map = [];
    let runnerKeys = await client.keysAsync("runner.*");
    for (const runnerKey of runnerKeys) {
        runnerValue = JSON.parse(await client.getAsync(runnerKey));
        runner_map.push(runnerValue);
    }
    return runner_map;
}

const checkRunners = async () => {
    let runner_map = [];
    let runnerKeys = await client.keysAsync("runner.*");
    for (const runnerKey of runnerKeys) {
        runnerValue = JSON.parse(await client.getAsync(runnerKey));
        if (runnerValue.alive) {
            runner_map.push(runnerValue);
        }
    }
    for (const runner of runner_map) {
        let res = await axios.get("http://" + runner.runnerName + ":11044/health").catch(async (err) => {
            log.info(`Something wrong with runner.${runner.runnerName}. If there are any other runners will migrating containers!`);
            runner.alive = false;
            await client.setAsync("runner." + runner.runnerName, JSON.stringify(runner));
            if (runner_map.length > 1 && !_.isEmpty(runner.containers)) {
                await migrateRunnerContainers(runner.runnerName);
                runner.containers = [];
                await client.setAsync("runner." + runner.runnerName, JSON.stringify(runner));
            }
        });
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