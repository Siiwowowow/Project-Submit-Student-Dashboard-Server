//src/app/module/admin/admin.service.ts
//src/app/module/admin/admin.service.ts
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { IUpdateAdminPayload, IChangeUserRolePayload, IChangeUserStatusPayload } from "./admin.interface.js";
import AppError from "../../errorHelpers/AppError.js";
import { userStatus } from "@prisma/client";

const getAllAdmins = async () => {
    const admins = await prisma.admin.findMany({
        include: {
            user: true,
        }
    })
    return admins;
}

const getAdminById = async (id: string) => {
    const admin = await prisma.admin.findUnique({
        where: {
            id,
        },
        include: {
            user: true,
        }
    })
    return admin;
}

const updateAdmin = async (id: string, payload: IUpdateAdminPayload) => {
    //TODO: Validate who is updating the admin user. Only super admin can update admin user and only super admin can update super admin user but admin user cannot update super admin user

    const isAdminExist = await prisma.admin.findUnique({
        where: {
            id,
        }
    })

    if (!isAdminExist) {
        throw new AppError(status.NOT_FOUND, "Admin Or Super Admin not found");
    }

    const { admin } = payload;

    const updatedAdmin = await prisma.admin.update({
        where: {
            id,
        },
        data: {
            ...admin,
        }
    })

    return updatedAdmin;
}

//soft delete admin user by setting isDeleted to true and also delete the user session and account
const deleteAdmin = async (id: string, user: IRequestUser) => {
    //TODO: Validate who is deleting the admin user. Only super admin can delete admin user and only super admin can delete super admin user but admin user cannot delete super admin user

    const isAdminExist = await prisma.admin.findUnique({
        where: {
            id,
        }
    })

    if (!isAdminExist) {
        throw new AppError(status.NOT_FOUND, "Admin Or Super Admin not found");
    }

    if(isAdminExist.id === user.userId){
        throw new AppError(status.BAD_REQUEST, "You cannot delete yourself");
    }

    const result = await prisma.$transaction(async (tx) => {
        await tx.admin.update({
            where: { id },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
            },
        })

        await tx.user.update({
            where: { id: isAdminExist.userId },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
                status: userStatus.DELETED
            },
        })

        await tx.session.deleteMany({
            where: { userId: isAdminExist.userId }
        })

        await tx.account.deleteMany({
            where: { userId: isAdminExist.userId }
        })

        const admin = await getAdminById(id);

        return admin;
    })

    return result;
}

const changeUserStatus = async (payload: IChangeUserStatusPayload, currentUser: IRequestUser) => {
    // TODO: Add authorization logic - only super admin can change user status
    // Check if current user is super admin
    
    const { userId, status: userStatus } = payload; // Renamed to avoid conflict with status import
    
    // Check if user exists
    const user = await prisma.user.findUnique({
        where: { id: userId }
    });
    
    if (!user) {
        throw new AppError(status.NOT_FOUND, "User not found");
    }
    
    // Prevent self-status change if needed
    if (user.id === currentUser.userId) {
        throw new AppError(status.BAD_REQUEST, "You cannot change your own status");
    }
    
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
            status: userStatus // Now using the correct field name
        }
    });
    
    return updatedUser;
}

const changeUserRole = async (payload: IChangeUserRolePayload, currentUser: IRequestUser) => {
    // TODO: Add authorization logic - only super admin can change user roles
    // Check if current user is super admin
    
    const { userId, role } = payload;
    
    // Check if user exists
    const user = await prisma.user.findUnique({
        where: { id: userId }
    });
    
    if (!user) {
        throw new AppError(status.NOT_FOUND, "User not found");
    }
    
    // Prevent self-role change if needed
    if (user.id === currentUser.userId) {
        throw new AppError(status.BAD_REQUEST, "You cannot change your own role");
    }
    
    // Update user role
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
            role: role
        }
    });
    
    return updatedUser;
}

export const AdminService = {
    getAllAdmins,
    getAdminById,
    updateAdmin,
    deleteAdmin,
    changeUserRole,
    changeUserStatus
}
