import type { NextPage } from "next";
import { useRouter } from "next/router";
import { Head, Layout } from "@/components";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Props = {
  version: string;
};

const Home: NextPage<Props> = ({ version }) => {
  const { asPath } = useRouter();

  return (
    <Layout>
      <Head
        title="Spec View"
        description="The easiest way to edit and view OpenAPI specs. Streamline your API workflow with a modern, developer-focused tool."
        path={asPath}
      />

      {/* Hero Section */}
      <section className="bg-slate-900 text-white py-24 px-6 md:px-12 lg:px-24 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Edit & View OpenAPI Specs Seamlessly
        </h1>
        <p className="mt-4 text-lg text-slate-300 max-w-3xl mx-auto">
          A modern, intuitive tool that simplifies API documentation. Validate, preview, and manage OpenAPI specs effortlessly.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-4">
          <Button variant="default" size="lg" asChild>
            <a href="/docs">Get Started</a>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a href="mailto:support@specview.io">Contact Support</a>
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto my-20 px-6">
        <h2 className="text-3xl font-semibold text-center text-slate-200">
          Why Use Spec View?
        </h2>
        <p className="mt-4 text-center text-slate-300">
          A powerful OpenAPI spec editor designed for developers. No complexity, just a seamless experience.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="bg-white shadow-lg">
            <CardHeader>
              <CardTitle>Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="text-slate-700">
              Instantly see how your OpenAPI specs render into API documentation, without extra steps.
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardHeader>
              <CardTitle>Error Detection</CardTitle>
            </CardHeader>
            <CardContent className="text-slate-700">
              Identify syntax errors, missing fields, and invalid schemas as you edit.
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardHeader>
              <CardTitle>Export & Integrate</CardTitle>
            </CardHeader>
            <CardContent className="text-slate-700">
              Generate compliant OpenAPI specs that work seamlessly with Postman, Swagger UI, and other API tools.
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="my-20" />

      {/* Call-to-Action Section */}
      <section className="container mx-auto my-20 px-6 text-center">
        <h2 className="text-3xl font-semibold text-slate-200">
          The OpenAPI Tool You’ve Been Looking For
        </h2>
        <p className="mt-4 text-slate-300">
          Eliminate tedious manual validation. Focus on what matters: building great APIs.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-4">
          <Button variant="default" size="lg" asChild>
            <a href="/docs">Start Editing</a>
          </Button>
          <Button variant="secondary" size="lg" asChild>
            <a href="mailto:support@specview.io">Get in Touch</a>
          </Button>
        </div>
      </section>

      <Separator className="my-20" />

      {/* Footer Section */}
      <footer className="bg-slate-900 text-white py-12 px-6 text-center">
        <div className="container mx-auto">
          <p className="text-lg font-semibold">Have questions?</p>
          <p className="mt-2 text-slate-300">
            We’re here to help. Reach out any time.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-4">
            <Button variant="default" asChild>
              <a href="/docs">Read Docs</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="mailto:support@specview.io">Contact Support</a>
            </Button>
          </div>

          <Separator className="my-8 mx-auto w-1/2 opacity-30" />

          <p className="text-sm text-slate-400">
            © {new Date().getFullYear()} Spec View v{version}. All rights reserved.
          </p>
        </div>
      </footer>
    </Layout>
  );
};

export const getStaticProps = async () => {
  const { version } = await import("../../package.json");
  return {
    props: {
      version,
    },
  };
};

export default Home;