const net = require('net');
const fs = require('fs');
const path = require('path');
const EmailService = require('./emailService');

class PostfixHandler {
  constructor(options = {}) {
    this.port = options.port || 25000;
    this.host = options.host || 'localhost';
    this.server = null;
    this.isRunning = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = net.createServer((socket) => {
          console.log('New connection from:', socket.remoteAddress);
          this.handleConnection(socket);
        });

        this.server.listen(this.port, this.host, () => {
          this.isRunning = true;
          console.log(`Postfix handler listening on ${this.host}:${this.port}`);
          resolve();
        });

        this.server.on('error', (error) => {
          console.error('Server error:', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server && this.isRunning) {
        this.server.close(() => {
          this.isRunning = false;
          console.log('Postfix handler stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  handleConnection(socket) {
    let emailData = '';
    let isReceivingData = false;

    socket.on('data', (data) => {
      const chunk = data.toString();
      
      if (chunk.includes('MAIL FROM:')) {
        isReceivingData = true;
        emailData = '';
      }
      
      if (isReceivingData) {
        emailData += chunk;
      }
      
      // Check for end of email data
      if (chunk.includes('\r\n.\r\n') || chunk.endsWith('\n.\n')) {
        isReceivingData = false;
        this.processEmail(emailData);
        emailData = '';
      }
    });

    socket.on('end', () => {
      console.log('Connection ended');
      if (emailData.trim()) {
        this.processEmail(emailData);
      }
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  async processEmail(rawEmail) {
    try {
      console.log('Processing incoming email...');
      const result = await EmailService.processIncomingEmail(rawEmail);
      
      if (result) {
        console.log(`Email processed successfully: ${result.id}`);
      } else {
        console.log('Email was not processed (likely expired or invalid recipient)');
      }
    } catch (error) {
      console.error('Error processing email:', error);
    }
  }

  // Alternative method: Process emails from file (for development/testing)
  static async processEmailFromFile(filePath) {
    try {
      const rawEmail = fs.readFileSync(filePath, 'utf8');
      const result = await EmailService.processIncomingEmail(rawEmail);
      
      if (result) {
        console.log(`Email processed from file: ${result.id}`);
        return result;
      } else {
        console.log('Email from file was not processed');
        return null;
      }
    } catch (error) {
      console.error('Error processing email from file:', error);
      throw error;
    }
  }

  // Process emails from a directory (batch processing)
  static async processEmailsFromDirectory(directoryPath) {
    try {
      const files = fs.readdirSync(directoryPath);
      const emailFiles = files.filter(file => file.endsWith('.eml') || file.endsWith('.txt'));
      
      const results = [];
      
      for (const file of emailFiles) {
        const filePath = path.join(directoryPath, file);
        try {
          const result = await this.processEmailFromFile(filePath);
          results.push({ file, success: true, result });
          
          // Optionally delete processed file
          // fs.unlinkSync(filePath);
        } catch (error) {
          console.error(`Error processing file ${file}:`, error);
          results.push({ file, success: false, error: error.message });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error processing directory:', error);
      throw error;
    }
  }
}

// SMTP-like protocol handler for more advanced integration
class SMTPHandler extends PostfixHandler {
  constructor(options = {}) {
    super(options);
    this.currentState = 'INIT';
    this.currentMail = {
      from: '',
      to: [],
      data: ''
    };
  }

  handleConnection(socket) {
    let buffer = '';
    
    // Send greeting
    socket.write('220 tempmail.local SMTP Service Ready\r\n');
    this.currentState = 'READY';

    socket.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete lines
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        this.handleSMTPCommand(socket, line);
      }
    });

    socket.on('end', () => {
      console.log('SMTP connection ended');
    });

    socket.on('error', (error) => {
      console.error('SMTP socket error:', error);
    });
  }

  handleSMTPCommand(socket, command) {
    const cmd = command.toUpperCase();
    
    try {
      if (cmd.startsWith('HELO') || cmd.startsWith('EHLO')) {
        socket.write('250 tempmail.local Hello\r\n');
        this.currentState = 'READY';
        
      } else if (cmd.startsWith('MAIL FROM:')) {
        const from = this.extractEmail(cmd);
        this.currentMail.from = from;
        socket.write('250 OK\r\n');
        this.currentState = 'MAIL';
        
      } else if (cmd.startsWith('RCPT TO:')) {
        const to = this.extractEmail(cmd);
        this.currentMail.to.push(to);
        socket.write('250 OK\r\n');
        this.currentState = 'RCPT';
        
      } else if (cmd === 'DATA') {
        socket.write('354 Start mail input; end with <CRLF>.<CRLF>\r\n');
        this.currentState = 'DATA';
        this.currentMail.data = '';
        
      } else if (this.currentState === 'DATA') {
        if (command === '.') {
          // End of data
          socket.write('250 OK: Message accepted\r\n');
          this.processSMTPEmail();
          this.resetCurrentMail();
          this.currentState = 'READY';
        } else {
          this.currentMail.data += command + '\r\n';
        }
        
      } else if (cmd === 'QUIT') {
        socket.write('221 Bye\r\n');
        socket.end();
        
      } else if (cmd === 'RSET') {
        this.resetCurrentMail();
        socket.write('250 OK\r\n');
        this.currentState = 'READY';
        
      } else {
        socket.write('500 Command not recognized\r\n');
      }
    } catch (error) {
      console.error('Error handling SMTP command:', error);
      socket.write('550 Internal server error\r\n');
    }
  }

  extractEmail(command) {
    const match = command.match(/<([^>]+)>/);
    return match ? match[1] : '';
  }

  async processSMTPEmail() {
    try {
      // Build raw email format
      const rawEmail = [
        `From: ${this.currentMail.from}`,
        `To: ${this.currentMail.to.join(', ')}`,
        `Date: ${new Date().toUTCString()}`,
        '',
        this.currentMail.data
      ].join('\r\n');

      const result = await EmailService.processIncomingEmail(rawEmail);
      
      if (result) {
        console.log(`SMTP email processed successfully: ${result.id}`);
      } else {
        console.log('SMTP email was not processed');
      }
    } catch (error) {
      console.error('Error processing SMTP email:', error);
    }
  }

  resetCurrentMail() {
    this.currentMail = {
      from: '',
      to: [],
      data: ''
    };
  }
}

module.exports = {
  PostfixHandler,
  SMTPHandler
}; 