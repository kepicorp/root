import dgram from 'node:dgram';

/**
 * Universally retrieves the active private network IP address of the machine.
 * Works across Windows, macOS, and Linux without external dependencies.
 * @returns {Promise<string>} The local IPv4 address or fallback localhost.
 */
function getPrivateIP() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    
    // Connect to a dummy public IP. No actual packets are transmitted.
    socket.connect(1, '8.8.8.8', () => {
      const { address } = socket.address();
      socket.close();
      resolve(address);
    });

    // Fallback if the machine has no active network adapters or is completely offline
    socket.on('error', () => {
      socket.close();
      resolve('127.0.0.1');
    });
  });
}

/**
 * Determines the application IP, prioritizing Docker injection if present.
 */
async function main() {
  // 1. Check if an external IP was explicitly injected via Docker environment flag
  if (process.env.HOST_IP) {
    //console.log('Running inside Docker container.');
    console.log(`Injected Host IP: ${process.env.HOST_IP}`);
    return;
  }

  // 2. Otherwise, run the universal native OS detection
  //console.log('Running natively on host OS.');
  const nativeIP = await getPrivateIP();
  console.log(`Private Device IP: ${nativeIP}`);
}

main();