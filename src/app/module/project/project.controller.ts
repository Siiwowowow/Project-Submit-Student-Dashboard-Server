import { Role } from "@prisma/client";
import { catchAsync } from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { ProjectService } from "./project.service.js";
import { projectIdSchema, projectListSchema } from "./project.validation.js";

const createProject = catchAsync(async (req, res) => {
  const project = await ProjectService.createProject(req.user.userId, req.body);
  sendResponse(res, { httpCode: 201, success: true, message: "Project submitted successfully.", data: project });
});

const getProjects = catchAsync(async (req, res) => {
  const result = await ProjectService.getProjects(projectListSchema.parse(req.query));
  sendResponse(res, { httpCode: 200, success: true, message: "Projects retrieved successfully.", data: result });
});

const getMyProjects = catchAsync(async (req, res) => {
  const result = await ProjectService.getProjects(projectListSchema.parse(req.query), req.user.userId);
  sendResponse(res, { httpCode: 200, success: true, message: "Your projects retrieved successfully.", data: result });
});

const getStatistics = catchAsync(async (req, res) => {
  const isStudent = req.user.role === Role.STUDENT || req.user.role === Role.USER;
  const result = await ProjectService.getStatistics(isStudent ? req.user.userId : undefined);
  sendResponse(res, { httpCode: 200, success: true, message: "Project statistics retrieved successfully.", data: result });
});

const getProject = catchAsync(async (req, res) => {
  const id = projectIdSchema.parse(req.params.id);
  const isStudent = req.user.role === Role.STUDENT || req.user.role === Role.USER;
  const project = await ProjectService.getProject(id, isStudent ? req.user.userId : undefined);
  sendResponse(res, { httpCode: 200, success: true, message: "Project retrieved successfully.", data: project });
});

const reviewProject = catchAsync(async (req, res) => {
  const id = projectIdSchema.parse(req.params.id);
  const project = await ProjectService.reviewProject(id, req.user.userId, req.body);
  sendResponse(res, { httpCode: 200, success: true, message: "Project reviewed successfully.", data: project });
});

const markProject = catchAsync(async (req, res) => {
  const id = projectIdSchema.parse(req.params.id);
  const project = await ProjectService.markProject(id, req.user.userId, req.body);
  sendResponse(res, { httpCode: 200, success: true, message: "Project marks saved.", data: project });
});

const updateFeedback = catchAsync(async (req, res) => {
  const id = projectIdSchema.parse(req.params.id);
  const project = await ProjectService.updateFeedback(id, req.user.userId, req.body);
  sendResponse(res, { httpCode: 200, success: true, message: "Mentor feedback updated.", data: project });
});

const updateProject = catchAsync(async (req, res) => {
  const id = projectIdSchema.parse(req.params.id);
  const project = await ProjectService.updateProject(id, req.user.userId, req.body);
  sendResponse(res, { httpCode: 200, success: true, message: "Project updated.", data: project });
});

const deleteProject = catchAsync(async (req, res) => {
  const id = projectIdSchema.parse(req.params.id);
  const result = await ProjectService.deleteProject(id);
  sendResponse(res, { httpCode: 200, success: true, message: "Project deleted.", data: result });
});

export const ProjectController = {
  createProject, getProjects, getMyProjects, getStatistics, getProject, reviewProject, markProject, updateFeedback, updateProject, deleteProject,
};
