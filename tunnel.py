"""
SSH port-forward tunnel using paramiko.
Forwards local 127.0.0.1:5434 → remote 127.0.0.1:5433 on 187.124.237.242
"""
import paramiko
import threading
import socket
import sys

SSH_HOST = '187.124.237.242'
SSH_PORT = 22
SSH_USER = 'root'
SSH_PASS = 'Canada@202603'

LOCAL_PORT  = 5434
REMOTE_HOST = '127.0.0.1'
REMOTE_PORT = 5432


def forward_tunnel(local_port, remote_host, remote_port, transport):
    class Handler(paramiko.SubsystemHandler):
        pass

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', local_port))
    server.listen(100)
    print(f'[tunnel] Listening on 127.0.0.1:{local_port}', flush=True)

    while True:
        client_sock, addr = server.accept()

        def handle(sock, t, rh, rp):
            try:
                chan = t.open_channel('direct-tcpip', (rh, rp), sock.getpeername())
            except Exception as e:
                print(f'[tunnel] Channel error: {e}', flush=True)
                sock.close()
                return

            def pump(src, dst):
                try:
                    while True:
                        data = src.recv(4096)
                        if not data:
                            break
                        dst.sendall(data)
                except Exception:
                    pass

            t1 = threading.Thread(target=pump, args=(sock, chan), daemon=True)
            t2 = threading.Thread(target=pump, args=(chan, sock), daemon=True)
            t1.start(); t2.start()
            t1.join(); t2.join()
            sock.close()
            chan.close()

        threading.Thread(target=handle, args=(client_sock, transport, remote_host, remote_port), daemon=True).start()


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f'[tunnel] Connecting to {SSH_HOST}...', flush=True)
    client.connect(SSH_HOST, port=SSH_PORT, username=SSH_USER, password=SSH_PASS, timeout=15)
    print('[tunnel] Connected. Tunnel is UP.', flush=True)

    transport = client.get_transport()
    transport.set_keepalive(30)

    try:
        forward_tunnel(LOCAL_PORT, REMOTE_HOST, REMOTE_PORT, transport)
    except KeyboardInterrupt:
        print('\n[tunnel] Shutting down.', flush=True)
        client.close()
        sys.exit(0)


if __name__ == '__main__':
    main()
