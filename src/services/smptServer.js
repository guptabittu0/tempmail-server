const net = require('net');
const EmailService = require('./emailService');

// SMTP server handler for receiving emails directly
class SMTPHandler {
  constructor(options = {}) {
    this.port = options.port || 25;
    this.host = options.host || '0.0.0.0';
    this.server = null;
    this.connections = new Set();
    
    this.currentState = "INIT";
    this.currentMail = {
      from: "",
      to: [],
      data: "",
    };
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (error) => {
        reject(error);
      });

      this.server.listen(this.port, this.host, () => {
        console.log(`📬 SMTP server listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        // Close all connections
        this.connections.forEach(socket => {
          socket.destroy();
        });
        this.connections.clear();

        this.server.close(() => {
          console.log('SMTP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  handleConnection(socket) {
    let buffer = "";
    this.connections.add(socket);

    // Initialize mail state for this connection
    let mailState = {
      state: "READY",
      mail: {
        from: "",
        to: [],
        data: "",
      }
    };

    // Send greeting
    socket.write("220 tempmail.local SMTP Service Ready\r\n");

    socket.on("data", (data) => {
      buffer += data.toString();

      // Process complete lines
      const lines = buffer.split("\r\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        this.handleSMTPCommand(socket, line, mailState);
      }
    });

    socket.on("end", () => {
      this.connections.delete(socket);
      console.log("SMTP connection ended");
    });

    socket.on("error", (error) => {
      this.connections.delete(socket);
      console.error("SMTP socket error:", error);
    });

    socket.on('close', () => {
      this.connections.delete(socket);
    });
  }

  handleSMTPCommand(socket, command, mailState) {
    const cmd = command.toUpperCase();

    try {
      if (cmd.startsWith("HELO") || cmd.startsWith("EHLO")) {
        socket.write("250 tempmail.local Hello\r\n");
        mailState.state = "READY";
      } else if (cmd.startsWith("MAIL FROM:")) {
        const from = this.extractEmail(cmd);
        mailState.mail.from = from;
        socket.write("250 OK\r\n");
        mailState.state = "MAIL";
      } else if (cmd.startsWith("RCPT TO:")) {
        const to = this.extractEmail(cmd);
        mailState.mail.to.push(to);
        socket.write("250 OK\r\n");
        mailState.state = "RCPT";
      } else if (cmd === "DATA") {
        socket.write("354 Start mail input; end with <CRLF>.<CRLF>\r\n");
        mailState.state = "DATA";
        mailState.mail.data = "";
      } else if (mailState.state === "DATA") {
        if (command === ".") {
          // End of data
          socket.write("250 OK: Message accepted\r\n");
          this.processSMTPEmail(mailState.mail);
          this.resetCurrentMail(mailState);
          mailState.state = "READY";
        } else {
          mailState.mail.data += command + "\r\n";
        }
      } else if (cmd === "QUIT") {
        socket.write("221 Bye\r\n");
        socket.end();
      } else if (cmd === "RSET") {
        this.resetCurrentMail(mailState);
        socket.write("250 OK\r\n");
        mailState.state = "READY";
      } else {
        socket.write("500 Command not recognized\r\n");
      }
    } catch (error) {
      console.error("Error handling SMTP command:", error);
      socket.write("550 Internal server error\r\n");
    }
  }

  extractEmail(command) {
    const match = command.match(/<([^>]+)>/);
    return match ? match[1] : "";
  }

  async processSMTPEmail(mail) {
    try {
      console.log(`📧 Processing email from ${mail.from} to ${mail.to.join(', ')}`);
      
      // Build raw email format
      const rawEmail = [
        `From: ${mail.from}`,
        `To: ${mail.to.join(", ")}`,
        `Date: ${new Date().toUTCString()}`,
        "",
        mail.data,
      ].join("\r\n");

      const result = await EmailService.processIncomingEmail(rawEmail);

      if (result) {
        console.log(`✅ SMTP email processed successfully: ${result.id}`);
      } else {
        console.log("⚠️ SMTP email was not processed (no matching temp email)");
      }
    } catch (error) {
      console.error("❌ Error processing SMTP email:", error);
    }
  }

  resetCurrentMail(mailState) {
    mailState.mail = {
      from: "",
      to: [],
      data: "",
    };
  }
}

module.exports = SMTPHandler;
