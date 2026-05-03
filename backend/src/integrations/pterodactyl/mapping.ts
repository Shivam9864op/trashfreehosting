export interface EggTemplateMap {
  game: string;
  edition: string;
  eggId: number;
  dockerImage: string;
  startup: string;
  environment: Record<string, string>;
}

const EGG_TEMPLATE_MAP: EggTemplateMap[] = [
  {
    game: "minecraft",
    edition: "java",
    eggId: 1,
    dockerImage: "ghcr.io/pterodactyl/yolks:java_21",
    startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}",
    environment: {
      SERVER_JARFILE: "server.jar",
      VERSION: "LATEST",
      BUILD_NUMBER: "latest",
    },
  },
  {
    game: "minecraft",
    edition: "bedrock",
    eggId: 2,
    dockerImage: "ghcr.io/pterodactyl/yolks:bedrock_latest",
    startup: "LD_LIBRARY_PATH=. ./bedrock_server",
    environment: {
      SERVER_PORT: "19132",
    },
  },
];

export function resolveEggTemplate(game: string, edition: string): EggTemplateMap {
  const template = EGG_TEMPLATE_MAP.find(
    (entry) => entry.game === game.toLowerCase() && entry.edition === edition.toLowerCase()
  );

  if (!template) {
    throw new Error(`No egg/template mapping found for ${game}:${edition}`);
  }

  return template;
}

export function resolveResourceLimits(
  plan: { ramMb: number; cpuPercent: number; diskMb: number },
  boosts: { ramMb?: number; cpuPercent?: number } = {}
): { ramMb: number; cpuPercent: number; diskMb: number } {
  return {
    ramMb: plan.ramMb + (boosts.ramMb ?? 0),
    cpuPercent: plan.cpuPercent + (boosts.cpuPercent ?? 0),
    diskMb: plan.diskMb,
  };
}
