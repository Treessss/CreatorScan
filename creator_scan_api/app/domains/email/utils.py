
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from imap_tools import MailBox, AND
import datetime

def send_smtp(host, port, username, password, to_email, subject, body):
    msg = MIMEMultipart()
    msg['From'] = username
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    try:
        server = smtplib.SMTP(host, port)
        server.starttls()
        server.login(username, password)
        server.sendmail(username, to_email, msg.as_string())
        server.quit()
        return True, None
    except Exception as e:
        return False, str(e)

def check_imap_replies(host, username, password, criteria_list):
    """
    criteria_list: list of dict {'email_log_id': int, 'recipient_email': str}
    """
    imap_host = "imap.gmail.com" 
    if "outlook" in host: imap_host = "outlook.office365.com"
    
    replies = []
    try:
        with MailBox(imap_host).login(username, password) as mailbox:
            for item in criteria_list:
                # Search for emails FROM this recipient
                msgs = mailbox.fetch(AND(from_=item['recipient_email']))
                for msg in msgs:
                    # Found a reply
                    replies.append({
                        "email_log_id": item['email_log_id'],
                        "content": msg.text or msg.html,
                        "replied_at": msg.date
                    })
                    break 
    except Exception as e:
        print(f"IMAP Error: {e}")
    return replies
