const yup = require("yup");

const createServiceSchema = yup.object({
    serviceName: yup.string().trim().required(),
    replicas: yup.number().min(0).integer().default(1),
    image: yup.string().trim().required()
}).noUnknown().strict();

const getServiceSchema = yup.object({
    serviceName: yup.string().trim().required(),
});

const updateServiceSchema = yup.object({
    serviceName: yup.string().trim().required(),
    replicas: yup.number().min(0).integer().required()
}).noUnknown().strict();

const runnerSchema = yup.object({
    runnerName: yup.string().trim().required(),
    containers: yup.array(yup.object()).default([]).required(),
    alive: yup.boolean().default(true),
    lastAlive: yup.date().default(() => new Date().toISOString()),
}).noUnknown().strict();

const getRunnerSchema = yup.object({
    runnerName: yup.string().trim().required()
});

const nodesSchema = yup.object({
    node: yup.string().trim().required(),
    master: yup.boolean().required(),
    alive: yup.boolean().default(true),
    lastAlive: yup.date().default(() => new Date().toISOString()),
}).noUnknown().strict();

module.exports = { createServiceSchema, getServiceSchema, updateServiceSchema, runnerSchema , getRunnerSchema, nodesSchema };
