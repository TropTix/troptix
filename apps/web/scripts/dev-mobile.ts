// Requires NGROK_AUTH_TOKEN in .env; run via `pnpm dev:mobile`.
import 'dotenv/config';
import { spawn, ChildProcess } from 'child_process';
import ngrok from 'ngrok';
import qrcode from 'qrcode';

const TIMEOUT_MS = 30000;

async function run() {
  console.log('🚀 Starting Next.js dev server...');

  const devServer: ChildProcess = spawn('pnpm', ['exec', 'next', 'dev'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let resolved = false;
  let nextUrl = '';
  let ngrokConnected = false;
  let shutdownInProgress = false;

  const timeout = setTimeout(() => {
    if (!resolved) {
      console.error(
        '❌ Timeout: Could not detect Next.js dev server after 30 seconds'
      );
      cleanup();
    }
  }, TIMEOUT_MS);

  devServer.stdout?.on('data', async (data) => {
    const text = data.toString();
    process.stdout.write(text);

    const match = text.match(/(?:Local:|http:\/\/localhost:)(\d+)/);
    if (match && !resolved) {
      clearTimeout(timeout);
      const port = match[1];
      nextUrl = `http://localhost:${port}`;
      resolved = true;

      console.log(`🌐 Detected Next.js on ${nextUrl}`);
      console.log('🚇 Starting ngrok tunnel...');

      try {
        const url = await ngrok.connect({
          addr: parseInt(port),
          onStatusChange: (status) => {
            if (status === 'connected') {
              console.log('✅ Ngrok tunnel established');
            }
          },
        });

        ngrokConnected = true;
        console.log(`🔗 Public URL: ${url}`);
        console.log('📱 Scan this QR code:\n');
        const qr = await qrcode.toString(url, { type: 'terminal' });
        console.log(qr);
        console.log('\n💡 Press Ctrl+C to stop the server and tunnel');
      } catch (error) {
        console.error('❌ Failed to start ngrok tunnel:', error);
      }
    }
  });

  devServer.stderr?.on('data', (data) => {
    process.stderr.write(data.toString());
  });

  devServer.on('error', (error) => {
    console.error('❌ Failed to start dev server:', error);
    cleanup();
  });

  devServer.on('exit', (code, signal) => {
    if (!shutdownInProgress) {
      console.log(
        `\n⚠️  Dev server exited with code ${code} and signal ${signal}`
      );
      cleanup();
    }
  });

  async function cleanup() {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    console.log('\n🛑 Shutting down...');
    clearTimeout(timeout);

    if (ngrokConnected) {
      try {
        console.log('🚇 Closing ngrok tunnel...');
        await ngrok.disconnect();
        await ngrok.kill();
        console.log('✅ Ngrok tunnel closed');
      } catch (error) {
        // Ignore ngrok cleanup errors - it might already be disconnected
      }
    }

    if (devServer && !devServer.killed) {
      devServer.kill('SIGTERM');

      setTimeout(() => {
        if (!devServer.killed) {
          devServer.kill('SIGKILL');
        }
      }, 5000);
    }

    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);
}
run();
