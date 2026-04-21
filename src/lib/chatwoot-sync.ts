import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const COMPOSE_FILE = "/opt/chatwoot/docker-compose.yaml";

export async function syncChatwootTemplates(
  channelId = 2,
): Promise<{ ok: boolean; output: string }> {
  const script = `
    ch = Channel::Whatsapp.find(${Number(channelId)})
    Whatsapp::Providers::WhatsappCloudService.new(whatsapp_channel: ch).sync_templates
    ch.reload
    puts "SYNC_OK count=#{ch.message_templates&.size}"
  `.trim();

  try {
    const { stdout, stderr } = await execFileAsync(
      "/usr/bin/docker",
      [
        "compose",
        "-f",
        COMPOSE_FILE,
        "exec",
        "-T",
        "rails",
        "bundle",
        "exec",
        "rails",
        "runner",
        script,
      ],
      { timeout: 90_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const combined = `${stdout}\n${stderr}`;
    const ok = combined.includes("SYNC_OK");
    return { ok, output: combined.slice(-600) };
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${String(e)}` : String(e);
    return { ok: false, output: msg.slice(-600) };
  }
}
