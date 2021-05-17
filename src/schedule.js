const { log } = require("../config/config.js");
const client = require("./redis-client");
const axios = require("axios");
const _ = require("lodash");

const balanceContainers = async (opts, create = true) => {
    let schedule_map = [];
    let runner_map = [];
    if (create) {
        let runnerKeys = await client.keysAsync("runner.*");
        for (const runnerKey of runnerKeys) {
            runnerValue = JSON.parse(await client.getAsync(runnerKey));
            if (runnerValue.alive) {
                runner_map.push({ key: runnerKey, containers: runnerValue.containers });
            }
        }
        let tmpContainerCounts = runner_map.map((obj) => obj.containers.length);

        for (let i = opts.replicas; i > 0; i--) {
            let unbalancedRunner = tmpContainerCounts.indexOf(Math.min(...tmpContainerCounts));
            schedule_map.push(runner_map[unbalancedRunner].key);
            tmpContainerCounts[unbalancedRunner]++;
        }
    } else {
        let serviceSpecificRunner_map = []
        for (const container of opts.containers) {
            runnerValue = JSON.parse(await client.getAsync(container.runner));
            let serviceSpecificContainers = []
            for (const serviceContainer of runnerValue.containers) {
                if (serviceContainer.serviceName == opts.serviceName) {
                    serviceSpecificContainers.push(serviceContainer);
                }
            }
            if (!_.isEmpty(serviceSpecificContainers)) {
                runner_map.push({ key: container.runner, containers: runnerValue.containers });
                serviceSpecificRunner_map.push({ key: container.runner, containers: serviceSpecificContainers });
            }
        }
        let tmpSpesificContainerCounts = serviceSpecificRunner_map.map((obj) => obj.containers.length);
        let tmpGeneralContainerCounts = runner_map.map((obj) => obj.containers.length);
        for (let i = opts.replicas; i > 0; i--) {
            let unbalancedRunner = tmpGeneralContainerCounts.indexOf(Math.max(...tmpGeneralContainerCounts));
            schedule_map.push(runner_map[unbalancedRunner].key);
            if (tmpSpesificContainerCounts[unbalancedRunner] == 1) {
                runner_map = runner_map.filter(item => item !== runner_map[unbalancedRunner]);
                serviceSpecificRunner_map = serviceSpecificRunner_map.filter(item => item !== serviceSpecificRunner_map[unbalancedRunner]);
                tmpSpesificContainerCounts = serviceSpecificRunner_map.map((obj) => obj.containers.length);
                tmpGeneralContainerCounts = runner_map.map((obj) => obj.containers.length);
            } else {
                tmpGeneralContainerCounts[unbalancedRunner]--;
                tmpSpesificContainerCounts[unbalancedRunner]--;
            }
        }
    }
    return schedule_map;
}

const createContainersToRunners = async (runners, opts) => {
    for (let i = 0; i < runners.length; i++) {
        let runnerUrl = "http://" + runners[i].slice(7) + ":11044";
        const res = await axios.post(runnerUrl + "/container", { opts }).catch(e => false);
        if (res !== false) {
            opts.containers.push({ containerName: res.data.name, runner: runners[i] })
        } else {
            log.error(`Something wrong with runner: ${runners[i]} | skipping creation of this replica.`);
        }
    }
    if (_.isEmpty(opts.containers)) {
        throw "Couldn't create any container. Runners not working!";
    }
    return opts;
}

const deleteContainersToRunners = async (runners, opts) => {
    for (let i = 0; i < runners.length; i++) {
        let runnerUrl = "http://" + runners[i].slice(7) + ":11044";
        const res = await axios.delete(runnerUrl + "/container", { data: opts }).catch(e => false);
        if (res !== false) {
            opts.containers = opts.containers.filter(item => item.containerName !== res.data.name);
        } else {
            log.error(`Something wrong with runner: ${runners[i]} | skipping deletion of this replica. Runner can sync later.`);
            RandomContainers = opts.containers.filter(item => item.runner === runners[i]);
            opts.containers = opts.containers.filter(item => item !== RandomContainers[0]);
        }
    }
    return opts;
}

const createService = async (opts) => {
    if (await client.getAsync("service." + opts.serviceName) !== null) throw "Service already exist!";
    let scheduledRunners = await balanceContainers(opts, true);
    opts.containers = [];
    let chagedOpts = await createContainersToRunners(scheduledRunners, opts);
    chagedOpts.replicas = chagedOpts.containers.length;
    await client.setAsync("service." + chagedOpts.serviceName, JSON.stringify(chagedOpts));
    return { service: chagedOpts };
}

const updateService = async (opts) => {
    let service = await client.getAsync("service." + opts.serviceName);
    if (_.isEmpty(service)) throw "No service in this name!";
    service = JSON.parse(service);
    if (service.replicas < opts.replicas) {
        opts.image = service.image;
        opts.replicas = opts.replicas - service.replicas;
        let scheduledRunners = await balanceContainers(opts, true);
        opts.containers = [];
        let chagedOpts = await createContainersToRunners(scheduledRunners, opts);
        service.replicas = service.replicas + chagedOpts.containers.length;
        service.containers = [...service.containers, ...chagedOpts.containers];
        await client.setAsync("service." + service.serviceName, JSON.stringify(service));
        return { service: service };
    } else if (service.replicas > opts.replicas) {
        opts.image = service.image;
        opts.replicas = service.replicas - opts.replicas;
        opts.containers = service.containers;
        let scheduledRunners = await balanceContainers(opts, false);
        let chagedOpts = await deleteContainersToRunners(scheduledRunners, opts);
        service.replicas = service.replicas - chagedOpts.containers.length;
        service.containers = chagedOpts.containers;
        await client.setAsync("service." + service.serviceName, JSON.stringify(service));
        return { service: service };
    } else {
        throw "Same replica count already exist!";
    }
}

const deleteService = async (opts) => {
    let service = await client.getAsync("service." + opts.serviceName);
    if (_.isEmpty(service)) throw "No service in this name!";
    service = JSON.parse(service);
    let scheduledRunners = await balanceContainers(service, false);
    await deleteContainersToRunners(scheduledRunners, service);
    await client.delAsync("service." + service.serviceName);
    return { message: `Service ${service.serviceName} deleted.` };
}

const getService = async (opts) => {
    let service = await client.getAsync("service." + opts.serviceName);
    if (service !== null) {
        return JSON.parse(service);
    } else {
        throw "No service in this name";
    }
}

const migrateRunnerContainers = async (runner) => {
    for (const container of runner.containers) {
        log.info(`Migrating containers for runner: ${runner.runnerName}`);
        let service = await client.getAsync("service." + container.serviceName);
        service.containers.filter((item) => item.runner !== ("runner." + runner.runnerName));
        service.replicas = service.replicas - 1;
        let opts = {
            "serviceName": container.serviceName,
            "image": container.image,
            "replica": 1
        }
        let scheduledRunners = await balanceContainers(opts, true);
        opts.containers = [];
        let chagedOpts = await createContainersToRunners(scheduledRunners, opts);
        service.replicas = service.replicas + chagedOpts.containers.length;
        service.containers = [...service.containers, ...chagedOpts.containers];
        await client.setAsync("service." + service.serviceName, JSON.stringify(service));
        return { service: chagedOpts };
    }
}

module.exports = { createService, deleteService, getService, updateService, migrateRunnerContainers };
