import { ContactMessage } from "../models/ContactMessage.model";
import { enqueueContactEmail } from "../jobs/contactEmail.job";
import type { ContactMessageDTO, CreateContactMessageDTO } from "../interfaces/contact.interface";

type ContactMessageDocumentLike = {
  _id: unknown;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  createdAt: Date;
};

function toContactMessageDTO(contactMessage: ContactMessageDocumentLike): ContactMessageDTO {
  return {
    id: String(contactMessage._id),
    name: contactMessage.name,
    email: contactMessage.email,
    phone: contactMessage.phone,
    subject: contactMessage.subject,
    message: contactMessage.message,
    createdAt: contactMessage.createdAt.toISOString(),
  };
}

export async function createContactMessage(data: CreateContactMessageDTO): Promise<ContactMessageDTO> {
  const contactMessage = await ContactMessage.create(data);

  await enqueueContactEmail(data);

  return toContactMessageDTO(contactMessage);
}
