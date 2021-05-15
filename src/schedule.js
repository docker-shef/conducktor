const { log } = require("../config/config.js");
const client = require("./redis-client");
const axios = require("axios");

// var val = {
//     environments: [],
//     commands: [],
//     mounts: [],
//     exposedPorts: [
//         "8080",
//         "8081"
//     ],
//     image: "nginx",
//     replicas: 1,
//     serviceName: "deneme"
// };

const balanceContainers = async (opts) => {
    let runnerKeys = await client.keysAsync("runner.*");
    let schedule_map = [];
    let runner_map = [];
    for (const runnerKey of runnerKeys) {
        runnerValue = JSON.parse(await client.getAsync(runnerKey));
        if (runnerValue.alive) {
            runner_map.push({ key: runnerKey, containerCount: runnerValue.containerCount });
        }
    }
    let tmpContainerCounts = runner_map.map((obj) => obj.containerCount);
    for (let i = opts.replicas; i > 0; i--) {
        let unbalancedRunner = tmpContainerCounts.indexOf(Math.min(...tmpContainerCounts));
        schedule_map.push(runner_map[unbalancedRunner].key);
        tmpContainerCounts[unbalancedRunner]++;
        runner_map[unbalancedRunner].containerCount++;
    }
    log.debug(schedule_map);
    return schedule_map;
}

const sendContainersToRunners = async (runners, opts) => {
    let createdContainers = [];
    for (let i=0; i<runners.length; i++) {
        const res = await axios.post(runners[i], {opts}).catch(e => false);
        if (res !== false) {
            createdContainers.push({container: res.data.json.opts, runner: runners[i]});
        } else {
            log.error(`Something wrong with runner: ${runners[i]} | skipping creation of this replica.`)
        }
    }
    return createdContainers;
}

const createService = async (opts) => {
    if (await client.getAsync("service." + opts.serviceName) !== null) throw "Service already exist!";
    let scheduledRunners = await balanceContainers(opts);
    let createdContainers = await sendContainersToRunners(scheduledRunners, opts);
    opts.replicas = createdContainers.length;
    await client.setAsync("service."+opts.serviceName, JSON.stringify(opts));
    return {service: opts, containers: createdContainers};
}

module.exports = { createService };
