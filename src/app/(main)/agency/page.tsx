import AgencyDetails from "@/components/forms/agency-detail";
import { getAuthUserDetails, verifyAndAcceptInvitation } from "@/lib/queries";
import { currentUser } from "@clerk/nextjs";
import { Plan } from "@prisma/client";
import { redirect } from "next/navigation";
import React from "react";

const handleRedirect = (path: string) => {
  return redirect(path);
};

const handleUserRoleRedirect = (
  user: any,
  agencyId: string,
  searchParams: any
) => {
  switch (user?.role) {
    case "SUBACCOUNT_GUEST":
    case "SUBACCOUNT_USER":
      return handleRedirect("/subaccount");
    case "AGENCY_OWNER":
    case "AGENCY_ADMIN":
      if (searchParams.plan) {
        return handleRedirect(
          `/agency/${agencyId}/billing?plan=${searchParams.plan}`
        );
      }

      if (searchParams.state) {
        const [statePath, stateAgencyId] = searchParams.state.split("___");
        if (!stateAgencyId) return <div>Not authorized</div>;
        return handleRedirect(
          `/agency/${stateAgencyId}/${statePath}?code=${searchParams.code}`
        );
      }

      return handleRedirect(`/agency/${agencyId}`);
    default:
      return <div>Not authorized</div>;
  }
};

const Page = async ({
  searchParams,
}: {
  searchParams: { plan: Plan; state: string; code: string };
}) => {
  const agencyId = await verifyAndAcceptInvitation();
  console.log(agencyId);

  const user = await getAuthUserDetails();

  if (agencyId) {
    return handleUserRoleRedirect(user, agencyId, searchParams);
  }

  const authUser = await currentUser();
  return (
    <div className="flex justify-center items-center mt-4">
      <div className="max-w-[850px] border-[1px] p-4 rounded-xl">
        <h1 className="text-4xl"> Create An Agency</h1>
        <AgencyDetails
          data={{ companyEmail: authUser?.emailAddresses[0].emailAddress }}
        />
      </div>
    </div>
  );
};

export default Page;
