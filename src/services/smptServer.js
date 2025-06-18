// SMTP-like protocol handler for more advanced integration
class SMTPHandler  {
  constructor(options = {}) {
    this.currentState = "INIT";
    this.currentMail = {
      from: "",
      to: [],
      data: "",
    };
  }

  handleConnection(socket) {
    let buffer = "";

    // Send greeting
    socket.write("220 tempmail.local SMTP Service Ready\r\n");
    this.currentState = "READY";

    socket.on("data", (data) => {
      buffer += data.toString();

      // Process complete lines
      const lines = buffer.split("\r\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        this.handleSMTPCommand(socket, line);
      }
    });

    socket.on("end", () => {
      console.log("SMTP connection ended");
    });

    socket.on("error", (error) => {
      console.error("SMTP socket error:", error);
    });
  }

  handleSMTPCommand(socket, command) {
    const cmd = command.toUpperCase();

    try {
      if (cmd.startsWith("HELO") || cmd.startsWith("EHLO")) {
        socket.write("250 tempmail.local Hello\r\n");
        this.currentState = "READY";
      } else if (cmd.startsWith("MAIL FROM:")) {
        const from = this.extractEmail(cmd);
        this.currentMail.from = from;
        socket.write("250 OK\r\n");
        this.currentState = "MAIL";
      } else if (cmd.startsWith("RCPT TO:")) {
        const to = this.extractEmail(cmd);
        this.currentMail.to.push(to);
        socket.write("250 OK\r\n");
        this.currentState = "RCPT";
      } else if (cmd === "DATA") {
        socket.write("354 Start mail input; end with <CRLF>.<CRLF>\r\n");
        this.currentState = "DATA";
        this.currentMail.data = "";
      } else if (this.currentState === "DATA") {
        if (command === ".") {
          // End of data
          socket.write("250 OK: Message accepted\r\n");
          this.processSMTPEmail();
          this.resetCurrentMail();
          this.currentState = "READY";
        } else {
          this.currentMail.data += command + "\r\n";
        }
      } else if (cmd === "QUIT") {
        socket.write("221 Bye\r\n");
        socket.end();
      } else if (cmd === "RSET") {
        this.resetCurrentMail();
        socket.write("250 OK\r\n");
        this.currentState = "READY";
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

  async processSMTPEmail() {
    try {
      // Build raw email format
      const rawEmail = [
        `From: ${this.currentMail.from}`,
        `To: ${this.currentMail.to.join(", ")}`,
        `Date: ${new Date().toUTCString()}`,
        "",
        this.currentMail.data,
      ].join("\r\n");

      const result = await EmailService.processIncomingEmail(rawEmail);

      if (result) {
        console.log(`SMTP email processed successfully: ${result.id}`);
      } else {
        console.log("SMTP email was not processed");
      }
    } catch (error) {
      console.error("Error processing SMTP email:", error);
    }
  }

  resetCurrentMail() {
    this.currentMail = {
      from: "",
      to: [],
      data: "",
    };
  }
}

module.exports = SMTPHandler;
