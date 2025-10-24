interface PageProps {
  params: { modelId: string };
}

const Page = async ({ params }: PageProps) => {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Settings for {params.modelId}</h1>
      <p className="text-sm text-zinc-600">Model settings form coming soon.</p>
    </div>
  );
};

export default Page;


