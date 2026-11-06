import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="mt-2 text-muted">
        This page doesn&apos;t exist, or it belongs to a private team you&apos;re not a member of.
      </p>
      <ButtonLink href="/" className="mt-6">Go home</ButtonLink>
    </div>
  );
}
