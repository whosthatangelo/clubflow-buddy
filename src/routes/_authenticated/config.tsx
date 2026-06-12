import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/config")({
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
});
