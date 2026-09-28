/** What the particle field shows for a section. See scripts/dioramas.ts. */
export type Formation =
  | 'scatter'
  | 'name'
  | 'galaxy'
  | 'recommender'
  | 'curator'
  | 'world'
  | 'medallion'
  | 'screening'
  | 'predictor';

export interface ProjectLink {
  kind: 'code' | 'live' | 'paper';
  label: string;
  href: string;
}

export interface Project {
  slug: string;
  title: string;
  kind: string;
  description: string;
  stack: string[];
  links: ProjectLink[];
  accent: string;
  formation: Formation;
}

const code = (repo: string): ProjectLink => ({
  kind: 'code',
  label: 'View code',
  href: `https://github.com/eirasroger/${repo}`,
});

export const projects: Project[] = [
  {
    slug: 'recommender',
    title: 'Context-Adaptive Product Recommender',
    kind: 'Deep learning service',
    description:
      "A deep learning service that ranks shortlisted product alternatives for a given application context and set of stakeholder priorities. A versioned registry defines the indicators and product categories, so a new category is added through data and configuration with no changes to model code. PyTorch trains the model, and ONNX Runtime serves it behind a FastAPI service, with SHAP explanations for every ranking. A React and TypeScript comparison tool shares each comparison as a link.",
    stack: [
      'Python', 'PyTorch', 'ONNX Runtime', 'FastAPI', 'Pydantic', 'SQLAlchemy', 'Alembic', 'SHAP',
      'pytest', 'TypeScript', 'React', 'Vite', 'GitHub Actions', 'Docker', 'Vercel',
    ],
    links: [
      code('context-adaptive-product-recommender'),
      { kind: 'live', label: 'Open live app', href: 'https://context-adaptive-product-recommende.vercel.app/explore' },
      { kind: 'paper', label: 'Read the paper', href: 'https://doi.org/10.1016/J.SPC.2026.06.011' },
    ],
    accent: '#7ea6ff',
    formation: 'recommender',
  },
  {
    slug: 'data-curator',
    title: 'Data Curator',
    kind: 'LLM decision service on Google Cloud',
    description:
      'A cloud service that decides whether a proposed change to a published environmental product record is applied, rejected, or sent to human review. Arithmetic consistency checks settle most cases, an LLM classifies the rest, and fixed rules in code cap what the LLM is allowed to change. The auto-apply threshold is set where, in evaluation, no wrong change got through.',
    stack: [
      'Python', 'FastAPI', 'Pydantic', 'OpenAI API', 'Google Cloud (Cloud Run, Pub/Sub, BigQuery, Secret Manager, Cloud Scheduler)',
      'DuckDB', 'Terraform', 'Docker', 'Jinja/HTMX', 'GitHub Actions',
    ],
    links: [
      code('data-curator'),
      { kind: 'live', label: 'Open demo', href: 'https://eirasroger.github.io/data-curator' },
    ],
    accent: '#7fd6ae',
    formation: 'curator',
  },
  {
    slug: 'phd-defence',
    title: 'Interactive PhD Defence Presentation',
    kind: '3D presentation engine',
    description:
      'A browser-based presentation engine built around one continuous 3D world, where camera movement between scenes replaces slide transitions and the thesis figures are rebuilt as live compositions. Adapts rendering quality to the machine at runtime, runs fully offline, and deploys to GitHub Pages through CI.',
    stack: ['TypeScript', 'Vite', 'Three.js', 'GSAP', 'CSS', 'Blender (Python scripting)', 'GitHub Actions'],
    links: [
      code('interactive-phd-defense'),
      { kind: 'live', label: 'Open presentation', href: 'https://eirasroger.github.io/interactive-phd-defense' },
    ],
    accent: '#63c7da',
    formation: 'world',
  },
  {
    slug: 'lakehouse',
    title: 'Lakehouse Data Pipeline & Quality Gates',
    kind: 'Lakehouse pipeline',
    description:
      'An incremental bronze/silver/gold pipeline that turns a published research dataset of concrete product records into one validated modelling table. Content hashing and Change Data Feed limit each run to new or modified data, and a quality gate routes failing rows to a rejection table with reasons attached. Deployed as a chained Databricks job and tested in CI.',
    stack: ['Python', 'PySpark', 'Delta Lake', 'Databricks (Unity Catalog, Asset Bundles)', 'pytest', 'GitHub Actions'],
    links: [code('concrete-lakehouse-pipeline')],
    accent: '#e0b16a',
    formation: 'medallion',
  },
  {
    slug: 'screening-agent',
    title: 'Human-in-the-Loop Regulatory Screening Agent',
    kind: 'LLM compliance agent',
    description:
      'An LLM agent that screens concrete products for durability compliance, extracting data from product declarations and technical drawings and checking it against the applicable regulations and project requirements. Applies the most stringent requirement from all sources and returns a pass/fail verdict per product. Available as a live web application.',
    stack: ['Python', 'OpenAI API', 'Pydantic', 'PyMuPDF', 'Streamlit'],
    links: [
      code('concrete-screening-app'),
      { kind: 'live', label: 'Open live app (OpenAI key needed)', href: 'https://concrete-screening-app.streamlit.app' },
      { kind: 'paper', label: 'Read the paper', href: 'https://doi.org/10.1016/j.autcon.2026.106876' },
    ],
    accent: '#b9a4ff',
    formation: 'screening',
  },
  {
    slug: 'impact-predictor',
    title: 'Environmental Impact Predictor & Desktop App',
    kind: 'Deep learning desktop app',
    description:
      'Deep learning models that predict five environmental indicators across five life-cycle stages of a construction product from its material composition, category, and circularity data. Packaged as a standalone Windows application with live prediction, multi-product comparison, and saved scenarios, released as an installer through GitHub Actions.',
    stack: ['Python', 'PyTorch', 'fastText embeddings', 'CustomTkinter', 'Matplotlib', 'PyInstaller', 'GitHub Actions'],
    links: [code('material-composition-attribute-predictor')],
    accent: '#a9d87a',
    formation: 'predictor',
  },
];

export const contact = {
  email: 'roger.verges.eiras@gmail.com',
  linkedin: 'https://www.linkedin.com/in/roger-verges-eiras',
  github: 'https://github.com/eirasroger',
};
