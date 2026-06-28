/**
 * MDirectorService — OAuth2 + Campaign API integration.
 *
 * Configuration via .env:
 *   MDIRECTOR_USERNAME=107843
 *   MDIRECTOR_PASSWORD=<your_password_hash>
 *   MDIRECTOR_FROM_EMAIL=noreply@yourcompany.com
 *   MDIRECTOR_FROM_NAME=VSM Services
 *   MDIRECTOR_REPLY_TO=reply@yourcompany.com
 */

/** Options for creating an MDirector email campaign */
export interface MDirectorCampaignOptions {
  campaignName: string;
  listId: string;
  segmentId: string;
  subject: string;
  html?: string;
  templateId?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  scheduleDate?: string; // 'YYYY-MM-DD HH:MM:SS'
}

/** Result from an MDirector campaign creation */
export interface MDirectorCampaignResult {
  campaignId: string;
  envId?: string;
  subId?: string;
}

/**
 * MDirector email marketing service.
 * Handles OAuth2 authentication, contact subscription, campaign creation,
 * and delivery scheduling via the MDirector API.
 */
export class MDirectorService {
  private static readonly OAUTH_URL = 'https://app.mdirector.com/oauth2/token';
  private static readonly API_URL   = 'https://api.mdirector.com';

  // Token cache
  private static _token: string | null = null;
  private static _tokenExpiresAt = 0;

  static get username()  { return process.env.MDIRECTOR_USERNAME  || process.env.MDIRECTOR_API_KEY    || '107843'; }
  static get password()  { return process.env.MDIRECTOR_PASSWORD  || process.env.MDIRECTOR_API_SECRET || ''; }
  static get fromEmail() { return process.env.MDIRECTOR_FROM_EMAIL || ''; }
  static get fromName()  { return process.env.MDIRECTOR_FROM_NAME  || 'VSM Services'; }
  static get replyTo()   { return process.env.MDIRECTOR_REPLY_TO   || process.env.MDIRECTOR_FROM_EMAIL || ''; }

  static isConfigured(): boolean {
    return !!(this.password && this.fromEmail);
  }

  static scheduleDateInMinutes(minutes: number): string {
    const date = new Date(Date.now() + minutes * 60_000);
    const pad = (value: number) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      '-',
      pad(date.getMonth() + 1),
      '-',
      pad(date.getDate()),
      ' ',
      pad(date.getHours()),
      ':',
      pad(date.getMinutes()),
      ':',
      pad(date.getSeconds()),
    ].join('');
  }

  /**
   * Returns a valid Bearer token, refreshing if expired.
   */
  static async getToken(): Promise<string> {
    const now = Date.now();
    if (this._token && now < this._tokenExpiresAt - 60_000) {
      return this._token;
    }

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id:  'webapp',
      username:   this.username,
      password:   this.password,
    });

    const res = await fetch(this.OAUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`[MDirector] OAuth failed (${res.status}): ${text}`);
    }

    const data: any = await res.json();
    if (!data.access_token) {
      throw new Error(`[MDirector] OAuth response missing access_token: ${JSON.stringify(data)}`);
    }

    this._token = data.access_token;
    this._tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
    console.log('[MDirector] Token obtained, expires in', data.expires_in, 's');
    return this._token!;
  }

  /**
   * Clears the cached token (useful for testing or forced refresh).
   */
  static clearToken(): void {
    this._token = null;
    this._tokenExpiresAt = 0;
  }

  private static async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    };
  }

  private static async authJsonHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    };
  }

  /**
   * Subscribe a contact to a list + segment.
   * POST /api_contact
   */
  static async subscribeContact(
    email: string,
    name: string,
    listId: string,
    segmentId: string,
  ): Promise<void> {
    const headers = await this.authHeaders();
    const body = new URLSearchParams({ email, name, listId, segmentId });

    const res = await fetch(`${this.API_URL}/api_contact`, {
      method:  'POST',
      headers,
      body: body.toString(),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`[MDirector] subscribeContact failed (${res.status}): ${JSON.stringify(data)}`);
    }
    console.log(`[MDirector] Subscribed ${email} → list=${listId} segment=${segmentId}`);
  }

  /**
   * Get all lists.
   * GET /api_list
   */
  static async getLists(): Promise<any> {
    const token  = await this.getToken();
    const res    = await fetch(`${this.API_URL}/api_list`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`[MDirector] getLists failed (${res.status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  /**
   * Get all campaigns.
   * GET /api_campaign
   */
  static async getCampaigns(): Promise<any> {
    const token = await this.getToken();
    const res   = await fetch(`${this.API_URL}/api_campaign`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`[MDirector] getCampaigns failed (${res.status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  static async getDeliveries(): Promise<any> {
    const token = await this.getToken();
    const res = await fetch(`${this.API_URL}/api_delivery`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`[MDirector] getDeliveries failed (${res.status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  /**
   * Create a campaign (and optionally schedule it).
   * POST /api_campaign → { data: { camId: "X" } }
   * If scheduleDate provided: PUT /api_campaign to schedule
   */
  static async createCampaign(opts: {
    name: string;
    listId: string;
    segmentId: string;
    subject: string;
    html?: string;
    templateId?: string;
    fromEmail?: string;
    fromName?: string;
    replyTo?: string;
    scheduleDate?: string;
  }): Promise<string> {
    const headers = await this.authHeaders();

    const body = new URLSearchParams({
      name:      opts.name,
      listId:    opts.listId,
      segmentId: opts.segmentId,
      subject:   opts.subject,
      fromName:  opts.fromName  || this.fromName,
      fromEmail: opts.fromEmail || this.fromEmail,
      replyTo:   opts.replyTo   || this.replyTo,
      // Add scheduleDate directly to POST if provided (better than separate PUT)
      ...(opts.scheduleDate && { scheduleDate: opts.scheduleDate })
    });
    if (opts.html) body.set('html', opts.html);
    if (opts.templateId) {
      body.set('template_id', opts.templateId);
      body.set('templateId', opts.templateId);
    }

    const res = await fetch(`${this.API_URL}/api_campaign`, {
      method:  'POST',
      headers,
      body: body.toString(),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`[MDirector] createCampaign failed (${res.status}): ${JSON.stringify(data)}`);
    }

    const camId = String(data?.data?.camId ?? data?.data?.id ?? data?.id ?? '');
    if (!camId) {
      throw new Error(`[MDirector] createCampaign: no camId returned: ${JSON.stringify(data)}`);
    }

    console.log(`[MDirector] Campaign created: "${opts.name}" → camId=${camId}${opts.scheduleDate ? ` (scheduled for ${opts.scheduleDate})` : ''}`);

    return camId;
  }

  static async createDeliveryFromTemplate(opts: {
    name: string;
    campaignName: string;
    templateId: string;
    segmentId: string;
    subject: string;
    language: 'fr' | 'en' | 'es';
    templateVariables?: Record<string, unknown>;
    fromName?: string;
    replyToName?: string;
    replyToEmail?: string;
    scheduleDate?: string;
  }): Promise<MDirectorCampaignResult> {
    const headers = await this.authJsonHeaders();
    const body = {
      type: 'email',
      name: opts.name,
      subject: opts.subject,
      campaignName: opts.campaignName,
      language: opts.language,
      segments: JSON.stringify([String(opts.segmentId)]),
      templateId: opts.templateId,
      templateVariables: opts.templateVariables ?? {},
      fromName: opts.fromName || this.fromName,
      replyToName: opts.replyToName || this.fromName,
      replyToEmail: opts.replyToEmail || this.replyTo,
    };

    const res = await fetch(`${this.API_URL}/api_delivery`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`[MDirector] createDeliveryFromTemplate failed (${res.status}): ${JSON.stringify(data)}`);
    }

    const campaignId = String(data?.data?.camId ?? data?.camId ?? '');
    const envId = String(data?.data?.envId ?? data?.envId ?? '');
    const subId = String(data?.data?.subId ?? data?.subId ?? '');
    if (!envId) {
      throw new Error(`[MDirector] createDeliveryFromTemplate: no envId returned: ${JSON.stringify(data)}`);
    }

    console.log(`[MDirector] Delivery created from template ${opts.templateId}: envId=${envId}${campaignId ? ` camId=${campaignId}` : ''}`);

    if (opts.scheduleDate) {
      await this.scheduleDelivery(envId, opts.scheduleDate);
    }

    return { campaignId: campaignId || envId, envId, subId };
  }

  static async scheduleDelivery(envId: string, date: string = 'now'): Promise<void> {
    const headers = await this.authJsonHeaders();
    // mDirector only accepts 'now' or its own internal format; always use 'now' for immediate dispatch
    const resolvedDate = date && date !== 'now' ? 'now' : 'now';
    const res = await fetch(`${this.API_URL}/api_delivery`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ envId, date: resolvedDate }),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`[MDirector] scheduleDelivery failed (${res.status}): ${JSON.stringify(data)}`);
    }
    console.log(`[MDirector] Delivery ${envId} scheduled for ${date}`);
  }

  /**
   * Schedule an existing campaign (legacy method - kept for backward compatibility).
   * PUT /api_campaign — IMPORTANT: must send all campaign details when scheduling
   */
  static async scheduleCampaign(
    id: string,
    name: string,
    scheduleDate: string,
    opts?: {
      listId?: string;
      segmentId?: string;
      subject?: string;
      html?: string;
      templateId?: string;
      fromEmail?: string;
      fromName?: string;
      replyTo?: string;
    }
  ): Promise<void> {
    const headers = await this.authHeaders();

    // Build URLSearchParams with all required fields
    const body = new URLSearchParams({
      id,
      name,
      scheduleDate,
      // Include original campaign details when scheduling
      ...(opts?.listId && { listId: opts.listId }),
      ...(opts?.segmentId && { segmentId: opts.segmentId }),
      ...(opts?.subject && { subject: opts.subject }),
      ...(opts?.html && { html: opts.html }),
      ...(opts?.templateId && { template_id: opts.templateId, templateId: opts.templateId }),
      ...(opts?.fromEmail && { fromEmail: opts.fromEmail }),
      ...(opts?.fromName && { fromName: opts.fromName }),
      ...(opts?.replyTo && { replyTo: opts.replyTo }),
    });

    const res = await fetch(`${this.API_URL}/api_campaign`, {
      method:  'PUT',
      headers,
      body: body.toString(),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`[MDirector] scheduleCampaign failed (${res.status}): ${JSON.stringify(data)}`);
    }
    console.log(`[MDirector] Campaign ${id} scheduled for ${scheduleDate}`);
  }

  /**
   * Delete/close a campaign.
   * DELETE /api_campaign?id=X
   */
  static async deleteCampaign(id: string): Promise<void> {
    const token = await this.getToken();
    const res   = await fetch(`${this.API_URL}/api_campaign?id=${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`[MDirector] deleteCampaign failed (${res.status}): ${JSON.stringify(data)}`);
    }
    console.log(`[MDirector] Campaign ${id} deleted`);
  }

  /**
   * Full flow: create + optionally schedule a campaign for a segment.
   */
  static async sendCampaignToSegment(opts: MDirectorCampaignOptions): Promise<MDirectorCampaignResult> {
    const campaignId = await this.createCampaign({
      name:         opts.campaignName,
      listId:       opts.listId,
      segmentId:    opts.segmentId,
      subject:      opts.subject,
      html:         opts.html,
      templateId:   opts.templateId,
      fromEmail:    opts.fromEmail || this.fromEmail,
      fromName:     opts.fromName  || this.fromName,
      replyTo:      opts.replyTo   || this.replyTo,
      scheduleDate: opts.scheduleDate,
    });

    return { campaignId };
  }

  /**
   * Backward-compatible individual email send:
   * subscribes the contact to a general segment and creates a one-off campaign.
   */
  static async sendEmail(opts: {
    toEmail:        string;
    toName:         string;
    subject:        string;
    htmlBody:       string;
    companyId?:     string;
    employeeTypeId?: string;
    sentByUserId?:  string;
    [key: string]:  unknown;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Use Ontario "General" segment as default for individual sends
      const listId    = '28';
      const segmentId = '712';

      await this.subscribeContact(opts.toEmail, opts.toName, listId, segmentId);

      const campaignName = `OFFER_${opts.toEmail.split('@')[0]}_${Date.now()}`;
      const campaignId   = await this.createCampaign({
        name:      campaignName,
        listId,
        segmentId,
        subject:   opts.subject,
        html:      opts.htmlBody,
        scheduleDate: this.scheduleDateInMinutes(2),
      });

      return { success: true, messageId: campaignId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Keep backward compat: build offer email HTML for individual sends.
   */
  static buildOfferEmailHtml(opts: {
    companyName: string;
    contactName?: string;
    employeeTypeName: string;
    employeeTypeDescription: string;
    customMessage?: string;
    senderName: string;
  }): string {
    const greeting = opts.contactName
      ? `Dear ${opts.contactName}`
      : `Dear ${opts.companyName} Team`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Staffing Offer — ${opts.employeeTypeName}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">VSM Services</h1>
            <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">Specialized Staffing Solutions</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 20px;color:#1e293b;font-size:16px;">${greeting},</p>
            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.7;">
              We are reaching out to present our profile for
              <strong style="color:#2563eb;">${opts.employeeTypeName}</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;margin:24px 0;">
              <tr>
                <td style="padding:24px;">
                  <h2 style="margin:0 0 12px;font-size:20px;color:#1e3a5f;">${opts.employeeTypeName}</h2>
                  <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${opts.employeeTypeDescription}</p>
                </td>
              </tr>
            </table>
            ${opts.customMessage ? `<p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.7;">${opts.customMessage.replace(/\n/g, '<br>')}</p>` : ''}
            <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">
              Best regards,<br>
              <strong style="color:#1e293b;">${opts.senderName}</strong><br>
              <span style="color:#94a3b8;font-size:13px;">VSM Services</span>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}
