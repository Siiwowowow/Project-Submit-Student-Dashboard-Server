import { Prisma, ProjectStatus } from "@prisma/client";
import AppError from "../../errorHelpers/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { CreateProjectInput, ProjectListQuery, ReviewProjectInput, UpdateFeedbackInput, ProjectMarksInput } from "./project.validation.js";

const projectRelations = {
  student: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const;

const createProject = async (studentId: string, payload: CreateProjectInput) => {
  const existing = await prisma.project.findUnique({ where: { repoUrl: payload.repoUrl } });
  if (existing) throw new AppError(409, "This repository has already been submitted.");

  // studentId comes from the verified JWT, never from request body.
  return prisma.project.create({ data: { ...payload, studentId }, include: projectRelations });
};

const getProjects = async (query: ProjectListQuery, studentId?: string) => {
  const { page, limit, status } = query;
  const where: Prisma.ProjectWhereInput = {
    ...(status ? { status } : {}),
    ...(studentId ? { studentId } : {}),
  };

  // Both queries use the same filter and snapshot, keeping pagination counts consistent.
  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where, skip: (page - 1) * limit, take: limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: projectRelations,
    }),
    prisma.project.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  return { projects, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const getStatistics = async (studentId?: string) => {
  const where = studentId ? { studentId } : {};
  // Count in PostgreSQL instead of downloading every project into Node.
  const { groups, marks } = await prisma.$transaction(async (transaction) => {
    const groups = await transaction.project.groupBy({ by: ["status"], where, _count: { _all: true } });
    const marks = await transaction.project.groupBy({ by: ["scoreOutOf"], where: { ...where, score: { not: null } }, _count: { score: true }, _sum: { score: true } });
    return { groups, marks };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  const markedProjects = marks.reduce((total, group) => total + group._count.score, 0);
  const totalScore = marks.reduce((total, group) => total + (group._sum.score ?? 0), 0);
  const percentageSum = marks.reduce((total, group) => total + (group._sum.score ?? 0) * 100 / group.scoreOutOf, 0);
  return {
    totalProjects: counts.PENDING + counts.APPROVED + counts.REJECTED,
    totalPending: counts.PENDING,
    totalApproved: counts.APPROVED,
    totalRejected: counts.REJECTED,
    averageScore: markedProjects ? percentageSum / markedProjects : null,
    markedProjects,
    totalScore,
  };
};

const getProject = async (id: string, studentId?: string) => {
  const project = await prisma.project.findFirst({
    where: { id, ...(studentId ? { studentId } : {}) },
    include: projectRelations,
  });
  if (!project) throw new AppError(404, "Project not found.");
  return project;
};

const reviewProject = async (id: string, reviewerId: string, payload: ReviewProjectInput) => {
  return prisma.$transaction(async (transaction) => {
    const project = await transaction.project.findUnique({ where: { id } });
    if (!project) throw new AppError(404, "Project not found.");
    if (project.studentId === reviewerId) throw new AppError(403, "You cannot review your own project.");

    // Conditional update is atomic: two mentors cannot overwrite each other's decision.
    const result = await transaction.project.updateMany({
      where: { id, status: ProjectStatus.PENDING },
      data: {
        reviewCommentFormat: payload.reviewCommentFormat ?? Prisma.DbNull,
        status: payload.status, score: payload.score ?? null, scoreOutOf: payload.scoreOutOf, reviewComment: payload.reviewComment ?? null,
        reviewedById: reviewerId, reviewedAt: new Date(),
      },
    });
    if (!result.count) throw new AppError(409, "This project has already been reviewed.");
    return transaction.project.findUnique({ where: { id }, include: projectRelations });
  });
};

const markProject = async (id: string, reviewerId: string, payload: ProjectMarksInput) => {
  return prisma.$transaction(async (transaction) => {
    const project = await transaction.project.findUnique({ where: { id } });
    if (!project) throw new AppError(404, "Project not found.");
    if (project.studentId === reviewerId) throw new AppError(403, "You cannot mark your own project.");
    if (project.status === ProjectStatus.PENDING) throw new AppError(409, "Review this project before assigning marks.");
    return transaction.project.update({ where: { id }, data: { score: payload.score, scoreOutOf: payload.scoreOutOf }, include: projectRelations });
  });
};

const updateFeedback = async (id: string, reviewerId: string, payload: UpdateFeedbackInput) => {
  return prisma.$transaction(async (transaction) => {
    const project = await transaction.project.findUnique({ where: { id } });
    if (!project) throw new AppError(404, "Project not found.");
    if (project.studentId === reviewerId) throw new AppError(403, "You cannot review your own project.");
    if (project.status === ProjectStatus.PENDING) throw new AppError(409, "Review this project before editing feedback.");
    return transaction.project.update({
      where: { id },
      data: { reviewComment: payload.reviewComment, reviewCommentFormat: payload.reviewCommentFormat ?? Prisma.DbNull, reviewedById: reviewerId, reviewedAt: new Date() },
      include: projectRelations,
    });
  });
};

export const ProjectService = { createProject, getProjects, getStatistics, getProject, reviewProject, markProject, updateFeedback };
