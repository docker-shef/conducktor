const { log } = require("../config/config.js");
const client = require("./redis-client");
const _ = require("lodash");

const successfullyProcessedRequest = async () => {
    let res = await client.getAsync("successfulRequestsStats");
    res = _.isEmpty(res) ? { count: 0 } : JSON.parse(res);
    res.count++;
    await client.setAsync("successfulRequestsStats", JSON.stringify(res));
}

const failedProcessedRequest = async () => {
    let res = await client.getAsync("failedRequestsStats");
    res = _.isEmpty(res) ? { count: 0 } : JSON.parse(res);
    res.count++;
    await client.setAsync("failedRequestsStats", JSON.stringify(res));
}

const createdContainers = async (number) => {
    let res = await client.getAsync("createdContainersStats");
    res = _.isEmpty(res) ? { count: 0 } : JSON.parse(res);
    res.count += number;
    await client.setAsync("createdContainersStats", JSON.stringify(res));
}

const deletedContainers = async (number) => {
    let res = await client.getAsync("deletedContainersStats");
    res = _.isEmpty(res) ? { count: 0 } : JSON.parse(res);
    res.count += number;
    await client.setAsync("deletedContainersStats", JSON.stringify(res));
}

const createdServices = async () => {
    let res = await client.getAsync("createdServicesStats");
    res = _.isEmpty(res) ? { count: 0 } : JSON.parse(res);
    res.count++;
    await client.setAsync("createdServicesStats", JSON.stringify(res));
}

const deletedServices = async () => {
    let res = await client.getAsync("deletedServicesStats");
    res = _.isEmpty(res) ? { count: 0 } : JSON.parse(res);
    res.count++;
    await client.setAsync("deletedServicesStats", JSON.stringify(res));
}

const getAllStats = async () => {
    let sR = await client.getAsync("successfulRequestsStats");
    sR = _.isEmpty(sR) ? { count: 0 } : JSON.parse(sR);
    let fR = await client.getAsync("failedRequestsStats");
    fR = _.isEmpty(fR) ? { count: 0 } : JSON.parse(fR);
    let cC = await client.getAsync("createdContainersStats");
    cC = _.isEmpty(cC) ? { count: 0 } : JSON.parse(cC);
    let dC = await client.getAsync("deletedContainersStats");
    dC = _.isEmpty(dC) ? { count: 0 } : JSON.parse(dC);
    let cS = await client.getAsync("createdServicesStats");
    cS = _.isEmpty(cS) ? { count: 0 } : JSON.parse(cS);
    let dS = await client.getAsync("deletedServicesStats");
    dS = _.isEmpty(dS) ? { count: 0 } : JSON.parse(dS);
    return {
        processedRequests: {
            Total: sR.count + fR.count,
            Succeeded: sR.count,
            Failed: fR.count
        },
        containers: {
            Created: cC.count,
            Deleted: dC.count
        },
        services: {
            Created: cS.count,
            Deleted: dS.count
        }
    }
}

module.exports = {
    successfullyProcessedRequest,
    failedProcessedRequest,
    createdContainers,
    deletedContainers,
    createdServices,
    deletedServices,
    getAllStats
};