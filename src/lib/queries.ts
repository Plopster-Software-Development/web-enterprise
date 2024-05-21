"use server";

import { clerkClient, currentUser } from "@clerk/nextjs";
import { db } from "./db";
import { redirect } from "next/navigation";
import { Agency, Invitation, Plan, User } from "@prisma/client";
import type { User as clerkUser } from "@clerk/backend";

type SaveActivityLogsNotificationParams = {
  agencyId?: string;
  description: string;
  subaccountId?: string;
};

export const getAuthUserDetails = async () => {
  const user = await currentUser();
  if (!user) {
    return;
  }

  const userData = await db.user.findUnique({
    where: {
      email: user.emailAddresses[0].emailAddress,
    },
    include: {
      Agency: {
        include: {
          SidebarOption: true,
          SubAccount: {
            include: {
              SidebarOption: true,
            },
          },
        },
      },
      Permissions: true,
    },
  });

  return userData;
};

// Función auxiliar para obtener datos del usuario
const getUserData = async (
  authUser: clerkUser | null,
  subaccountId?: string
) => {
  if (authUser) {
    return await db.user.findUnique({
      where: { email: authUser.emailAddresses[0].emailAddress },
    });
  } else {
    const response = await db.user.findFirst({
      where: {
        Agency: {
          SubAccount: {
            some: { id: subaccountId },
          },
        },
      },
    });
    return response || null;
  }
};

// Función auxiliar para obtener el agencyId
const getAgencyId = async (agencyId?: string, subaccountId?: string) => {
  if (agencyId) return agencyId;

  if (!subaccountId) {
    throw new Error(
      "You need to provide at least an agency Id or subaccount Id"
    );
  }

  const response = await db.subAccount.findUnique({
    where: { id: subaccountId },
  });
  return response ? response.agencyId : null;
};

// Función principal para guardar la notificación de logs de actividad
export const saveActivityLogsNotification = async ({
  agencyId,
  description,
  subaccountId,
}: {
  agencyId?: string;
  description: string;
  subaccountId?: string;
}) => {
  const authUser = await currentUser();
  const userData = await getUserData(authUser, subaccountId);

  if (!userData) {
    throw new Error("Could not find a user");
  }

  const foundAgencyId = await getAgencyId(agencyId, subaccountId);

  const notificationData: any = {
    notification: `${userData.name} | ${description}`,
    User: {
      connect: {
        id: userData.id,
      },
    },
    Agency: {
      connect: {
        id: foundAgencyId,
      },
    },
  };

  if (subaccountId) {
    notificationData.SubAccount = {
      connect: { id: subaccountId },
    };
  }

  await db.notification.create({ data: notificationData });
};

export const createTeamUser = async (agencyId: string, user: User) => {
  if (user.role === "AGENCY_OWNER") return null;
  const response = await db.user.create({ data: { ...user } });
  return response;
};

// Función para manejar la creación del usuario del equipo
const handleCreateTeamUser = async (
  user: clerkUser,
  invitationExists: Invitation
) => {
  const userDetails = await createTeamUser(invitationExists.agencyId, {
    email: invitationExists.email,
    agencyId: invitationExists.agencyId,
    avatarUrl: user.imageUrl,
    id: user.id,
    name: `${user.firstName} ${user.lastName}`,
    role: invitationExists.role,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (!userDetails) return null;

  await saveActivityLogsNotification({
    agencyId: invitationExists.agencyId,
    description: `Joined`,
    subaccountId: undefined,
  });

  await clerkClient.users.updateUserMetadata(user.id, {
    privateMetadata: {
      role: userDetails.role || "SUBACCOUNT_USER",
    },
  });

  await db.invitation.delete({
    where: { email: userDetails.email },
  });

  return userDetails.agencyId;
};

// Función para manejar la verificación y aceptación de invitaciones
export const verifyAndAcceptInvitation = async () => {
  const user = await currentUser();
  if (!user) return redirect("/sign-in");

  const email = user.emailAddresses[0].emailAddress;

  const invitationExists = await db.invitation.findUnique({
    where: {
      email,
      status: "PENDING",
    },
  });

  if (invitationExists) {
    return await handleCreateTeamUser(user, invitationExists);
  }

  const agency = await db.user.findUnique({
    where: { email },
  });

  return agency ? agency.agencyId : null;
};

export const updateAgencyDetails = async (
  agencyId: string,
  agencyDetails: Partial<Agency>
) => {
  const response = await db.agency.update({
    where: { id: agencyId },
    data: { ...agencyDetails },
  });
  return response;
};

export const deleteAgency = async (agencyId: string) => {
  return await db.agency.delete({
    where: {
      id: agencyId,
    },
  });
};

export const upsertAgency = async (agency: Agency, price?: Plan) => {
  if (!agency.companyEmail) return null;
  try {
    const agencyDetails = await db.agency.upsert({
      where: {
        id: agency.id,
      },
      update: agency,
      create: {
        users: {
          connect: { email: agency.companyEmail },
        },
        ...agency,
        SidebarOption: {
          create: [
            {
              name: "Dashboard",
              icon: "category",
              link: `/agency/${agency.id}`,
            },
            {
              name: "Launchpad",
              icon: "clipboardIcon",
              link: `/agency/${agency.id}/launchpad`,
            },
            {
              name: "Billing",
              icon: "payment",
              link: `/agency/${agency.id}/billing`,
            },
            {
              name: "Settings",
              icon: "settings",
              link: `/agency/${agency.id}/settings`,
            },
            {
              name: "Sub Accounts",
              icon: "person",
              link: `/agency/${agency.id}/all-subaccounts`,
            },
            {
              name: "Team",
              icon: "shield",
              link: `/agency/${agency.id}/team`,
            },
          ],
        },
      },
    });
    return agencyDetails;
  } catch (error) {
    console.log(error);
  }
};

export const initUser = async (newUser: Partial<User>) => {
  const user = await currentUser();
  if (!user) return;

  const userData = await db.user.upsert({
    where: {
      email: user.emailAddresses[0].emailAddress,
    },
    update: newUser,
    create: {
      id: user.id,
      avatarUrl: user.imageUrl,
      email: user.emailAddresses[0].emailAddress,
      name: `${user.firstName} ${user.lastName}`,
      role: newUser.role || "SUBACCOUNT_USER",
    },
  });

  await clerkClient.users.updateUserMetadata(user.id, {
    privateMetadata: {
      role: newUser.role || "SUBACCOUNT_USER",
    },
  });

  return userData;
};
