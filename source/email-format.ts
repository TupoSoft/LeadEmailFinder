import {Lead} from "./lead-email-finder";

export const enum EmailFormatType {
    FirstNameDotLastName,
    FirstInitialLastName,
    FirstName,
    FirstNameUnderscoreLastName,
    FirstNameLastName,
    LastNameFirstInitial,
    FirstInitialDotLastName,
    FirstNameLastInitial,
    FirstInitialLastInitial,
    FirstNameDotLastInitial,
    FirstInitialDotLastInitial,
    LastName,
}

export function generateEmailFormats(lead: Lead): Record<EmailFormatType, string> {
    const {firstName, lastName, domain} = lead
    const firstInitial = firstName.charAt(0);
    const lastInitial = lastName.charAt(0);

    return {
        [EmailFormatType.FirstNameDotLastName]: `${firstName}.${lastName}@${domain}`,
        [EmailFormatType.FirstInitialLastName]: `${firstInitial}${lastName}@${domain}`,
        [EmailFormatType.FirstName]: `${firstName}@${domain}`,
        [EmailFormatType.FirstNameUnderscoreLastName]: `${firstName}_${lastName}@${domain}`,
        [EmailFormatType.FirstNameLastName]: `${firstName}${lastName}@${domain}`,
        [EmailFormatType.LastNameFirstInitial]: `${lastName}${firstInitial}@${domain}`,
        [EmailFormatType.FirstInitialDotLastName]: `${firstInitial}.${lastName}@${domain}`,
        [EmailFormatType.FirstNameLastInitial]: `${firstName}${lastInitial}@${domain}`,
        [EmailFormatType.FirstInitialLastInitial]: `${firstInitial}${lastInitial}@${domain}`,
        [EmailFormatType.FirstNameDotLastInitial]: `${firstName}.${lastInitial}@${domain}`,
        [EmailFormatType.FirstInitialDotLastInitial]: `${firstInitial}.${lastInitial}@${domain}`,
        [EmailFormatType.LastName]: `${lastName}@${domain}`
    }
}
