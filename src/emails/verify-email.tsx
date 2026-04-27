import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "@react-email/components";

type VerifyEmailProps = {
  name: string;
  verificationUrl: string;
};

export const VerifyEmail = ({ name, verificationUrl }: VerifyEmailProps) => (
  <Html lang="en">
    <Head />
    <Preview>Verify your Produktive email address</Preview>
    <Tailwind
      config={{
        presets: [pixelBasedPreset],
        theme: {
          extend: {
            colors: {
              ink: "#111827",
              muted: "#6b7280",
              line: "#e5e7eb",
              brand: "#111827",
              surface: "#f9fafb",
            },
          },
        },
      }}
    >
      <Body className="m-0 bg-surface px-4 py-8 font-sans">
        <Container className="mx-auto max-w-xl rounded-lg bg-white px-8 py-8">
          <Section>
            <Text className="m-0 text-sm font-semibold text-ink">Produktive</Text>
            <Heading className="mb-3 mt-8 text-2xl font-semibold text-ink">
              Verify your email
            </Heading>
            <Text className="text-base leading-6 text-muted">
              Hi {name}, confirm this email address to finish setting up your
              Produktive account.
            </Text>
            <Button
              href={verificationUrl}
              className="mt-5 box-border rounded-md bg-brand px-5 py-3 text-center text-sm font-semibold text-white no-underline"
            >
              Verify email
            </Button>
            <Hr className="my-8 border-line" />
            <Text className="text-sm leading-6 text-muted">
              If the button does not work, paste this link into your browser:
            </Text>
            <Text className="break-all text-sm leading-6 text-muted">
              {verificationUrl}
            </Text>
          </Section>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

VerifyEmail.PreviewProps = {
  name: "Jane",
  verificationUrl: "https://produktive.app/verify-email",
} satisfies VerifyEmailProps;
