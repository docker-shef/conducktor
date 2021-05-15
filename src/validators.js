const yup = require("yup");

const createServiceSchema = yup.object({
    serviceName: yup.string().trim().required(),
    replicas: yup.number().min(0).integer().default(1),
    image: yup.string().trim().required(),
    exposedPorts: yup.array(yup.string().matches(/(\d{2,5})/).trim()).default([]),
    mounts: yup.array(yup.string().trim()).default([]),
    commands: yup.array(yup.string().trim()).default([]),
    environments: yup.array(yup.string().trim()).default([]),
}).noUnknown().strict();

const getServiceSchema = yup.object({
    serviceName: yup.string().trim().required(),
});

const updateServiceSchema = yup.object({
    serviceName: yup.string().trim().required(),
    replicas: yup.number().min(0).integer(),
    image: yup.string().trim(),
    exposedPorts: yup.array(yup.string().matches(/(\d{2,5})/).trim()),
    mounts: yup.array(yup.string().trim()),
    commands: yup.array(yup.string().trim()),
    environments: yup.array(yup.string().trim()),
}).noUnknown().strict();

const runnerSchema = yup.object({
    runnerName: yup.string().trim().required(),
    containerCount: yup.number().min(0).integer().required(),
    alive: yup.boolean().default(true),
    lastAlive: yup.date().default(() => new Date().toISOString()),
}).noUnknown().strict();

module.exports = { createServiceSchema, getServiceSchema, updateServiceSchema, runnerSchema };
