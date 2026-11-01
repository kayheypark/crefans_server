-- Report reasons offered in the service: adds PRIVACY (개인정보 노출). Existing values are unchanged.
ALTER TABLE `user_reports` MODIFY `reason` ENUM('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'COPYRIGHT', 'FRAUD', 'PRIVACY', 'OTHER') NOT NULL;
