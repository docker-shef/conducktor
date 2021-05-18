const { log } = require("../config/config.js");
const client = require("./redis-client");
const axios = require("axios");
const _ = require("lodash");

const getRunners = async (justAliveOnes = true) => {
    let runner_map = [];
    let runnerKeys = await client.keysAsync("runner.*");
    for (const runnerKey of runnerKeys) {
        runnerValue = JSON.parse(await client.getAsync(runnerKey));
        if (runnerValue.alive && justAliveOnes) {
            runner_map.push({ key: runnerKey, containers: runnerValue.containers });
        } else if (!justAliveOnes) {
            runner_map.push({ key: runnerKey, containers: runnerValue.containers });
        }
    }
    return runner_map;
}

const balanceContainers = async (opts, create = true) => {
    let schedule_map = [];
    let runner_map = [];
    if (create) {
        runner_map = await getRunners(true);
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

const createContainersToRunners = async (runner, opts) => {
    let runnerUrl = "http://" + runner.slice(7) + ":11044";
    const res = await axios.post(runnerUrl + "/container", { opts }).then(res => {
        opts.containers.push({ containerName: res.data.name, runner: runner });
        return true;
    }).catch(e => false);
    if (!res) {
        let runnerValue = JSON.parse(await client.getAsync(runner));
        await axios.get("http://" + runner.slice(7) + ":11044/health").catch(async (err) => {
            log.info(`Something wrong with runner.${runner}. Migrating containers!`);
            runnerValue.alive = false;
            await client.setAsync(runner, JSON.stringify(runnerValue));
        });
        throw (`Something wrong with runner: ${runner} | couldn't create container.`);
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
            let runnerValue = JSON.parse(await client.getAsync(runners[i]));
            runnerValue.containers = runnerValue.containers.filter(item => item.name !== RandomContainers[0].containerName);
            await client.setAsync(runners[i], JSON.stringify(runnerValue));
            opts.containers = opts.containers.filter(item => item !== RandomContainers[0]);
        }
    }
    return opts;
}

const createService = async (opts) => {
    if (await client.getAsync("service." + opts.serviceName) !== null) throw "Service already exist!";
    opts.containers = [];
    if (opts.replicas === 0) {
        await client.setAsync("service." + opts.serviceName, JSON.stringify(opts));
        return { service: opts };
    } else {
        for (let i = opts.replicas; i > 0; i--) {
            let aliveRunners = await getRunners(true);
            if (_.isEmpty(aliveRunners)) {
                throw "Couldn't create any container. No alive runner!";
            } else {
                let tmpOpts = opts;
                tmpOpts.replicas = 1;
                let scheduledRunners = await balanceContainers(tmpOpts, true);
                await createContainersToRunners(scheduledRunners[0], tmpOpts).then(res => {
                    opts.containers = res.containers;
                }).catch(e => {
                    log.error(e);
                    i++
                });
            }
        }
        opts.replicas = opts.containers.length;
        await client.setAsync("service." + opts.serviceName, JSON.stringify(opts));
        return { service: opts };
    }
}

const updateService = async (opts) => {
    let service = await client.getAsync("service." + opts.serviceName);
    if (_.isEmpty(service)) throw "No service in this name!";
    service = JSON.parse(service);
    if (service.replicas < opts.replicas) {
        opts.image = service.image;
        opts.replicas = opts.replicas - service.replicas;
        opts.containers = [];
        for (let i = opts.replicas; i > 0; i--) {
            let aliveRunners = await getRunners(true);
            if (_.isEmpty(aliveRunners)) {
                throw "Couldn't create any container. No alive runner!";
            } else {
                let tmpOpts = opts;
                tmpOpts.replicas = 1;
                let scheduledRunners = await balanceContainers(tmpOpts, true);
                await createContainersToRunners(scheduledRunners[0], tmpOpts).then(res => {
                    opts.containers = res.containers;
                }).catch(e => {
                    log.error(e);
                    i++
                });
            }
        }
        service.containers = [...service.containers, ...opts.containers];
        service.replicas = service.containers.length;
        await client.setAsync("service." + service.serviceName, JSON.stringify(service));
        return { service: service };
    } else if (service.replicas > opts.replicas) {
        opts.replicas = service.replicas - opts.replicas;
        log.debug("replicaDiff:", opts.replicas);
        for (let i = opts.replicas; i > 0; i--) {
            let tmpOpts = service;
            tmpOpts.replicas = 1;
            let scheduledRunners = await balanceContainers(tmpOpts, false);
            await deleteContainersToRunners(scheduledRunners, tmpOpts).then(res => {
                service.containers = res.containers;
            });
        }
        service.replicas = service.containers.length;
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
    for (let i = service.replicas; i > 0; i--) {
        let tmpOpts = service;
        tmpOpts.replicas = 1;
        let scheduledRunners = await balanceContainers(tmpOpts, false);
        await deleteContainersToRunners(scheduledRunners, tmpOpts).then(res => {
            opts.containers = res.containers;
        });
    }
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
        let service = JSON.parse(await client.getAsync("service." + container.serviceName));
        log.debug("service before:", service);
        service.containers = service.containers.filter(item => item.runner !== ("runner." + runner.runnerName));
        service.replicas = service.replicas - 1;
        log.debug("service later:", service);
        let opts = {
            serviceName: service.serviceName,
            image: service.image,
            replicas: 1,
            containers: []
        }
        for (let i = opts.replicas; i > 0; i--) {
            let aliveRunners = await getRunners(true);
            if (_.isEmpty(aliveRunners)) {
                throw "Couldn't create any container. No alive runner!";
            } else {
                let tmpOpts = opts;
                tmpOpts.replicas = 1;
                let scheduledRunners = await balanceContainers(tmpOpts, true);
                await createContainersToRunners(scheduledRunners[0], tmpOpts).then(res => {
                    opts.containers = res.containers;
                }).catch(e => {
                    log.error(e);
                    i++
                });
            }
        }
        service.replicas = service.replicas + opts.containers.length;
        service.containers = [...service.containers, ...opts.containers];
        await client.setAsync("service." + service.serviceName, JSON.stringify(service));
    }
}

module.exports = { createService, deleteService, getService, updateService, migrateRunnerContainers };
