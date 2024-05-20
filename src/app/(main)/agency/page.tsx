import { getAuthUserDetails, verifyAndAcceptInvitation } from "@/lib/queries";
import { currentUser } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import React from "react";

const Page = async () => {
  const agencyId = await verifyAndAcceptInvitation();
  const user = await getAuthUserDetails();

  if (agencyId) {
  }
  return <div>Agency Dashboard</div>;
};

export default Page;
