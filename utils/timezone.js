/**
 * Timezone Utility for Indian Standard Time (IST)
 * Converts between UTC and IST for consistent date handling
 */

// Indian Standard Time offset: UTC+5:30
const IST_OFFSET_HOURS = 5.5;
const IST_OFFSET_MS = IST_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Get current date in IST
 * @returns {Date} Current date in IST
 */
export const getCurrentISTDate = () => {
  const utcDate = new Date();
  return new Date(utcDate.getTime() + IST_OFFSET_MS);
};

/**
 * Convert UTC date to IST
 * @param {Date|string} utcDate - UTC date to convert
 * @returns {Date} Date in IST
 */
export const convertUTCToIST = (utcDate) => {
  const date = new Date(utcDate);
  return new Date(date.getTime() + IST_OFFSET_MS);
};

/**
 * Convert IST date to UTC
 * @param {Date|string} istDate - IST date to convert
 * @returns {Date} Date in UTC
 */
export const convertISTToUTC = (istDate) => {
  const date = new Date(istDate);
  return new Date(date.getTime() - IST_OFFSET_MS);
};

/**
 * Get current date in YYYY-MM-DD format (IST)
 * @returns {string} Current date in IST as YYYY-MM-DD
 */
export const getCurrentISTDateString = () => {
  const istDate = getCurrentISTDate();
  return istDate.getFullYear() + '-' + 
    String(istDate.getMonth() + 1).padStart(2, '0') + '-' + 
    String(istDate.getDate()).padStart(2, '0');
};

/**
 * Get current timestamp in IST
 * @returns {string} Current timestamp in IST ISO format
 */
export const getCurrentISTTimestamp = () => {
  return getCurrentISTDate().toISOString();
};

/**
 * Format date for Indian locale
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date in Indian format
 */
export const formatDateForIndianLocale = (date) => {
  const istDate = typeof date === 'string' ? new Date(date) : date;
  // Convert to IST if it's in UTC
  const adjustedDate = new Date(istDate.getTime() + IST_OFFSET_MS);
  
  return adjustedDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
};

/**
 * Get date in YYYY-MM-DD format from any date
 * @param {Date|string} date - Date to convert
 * @param {boolean} convertToIST - Whether to convert to IST first
 * @returns {string} Date in YYYY-MM-DD format
 */
export const getDateString = (date, convertToIST = true) => {
  let targetDate = new Date(date);
  
  if (convertToIST) {
    targetDate = convertUTCToIST(targetDate);
  }
  
  return targetDate.getFullYear() + '-' + 
    String(targetDate.getMonth() + 1).padStart(2, '0') + '-' + 
    String(targetDate.getDate()).padStart(2, '0');
};

/**
 * Check if two dates are the same in IST
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} Whether dates are the same in IST
 */
export const isSameDateIST = (date1, date2) => {
  const dateString1 = getDateString(date1, true);
  const dateString2 = getDateString(date2, true);
  return dateString1 === dateString2;
};

/**
 * Get timezone info for debugging
 * @returns {object} Timezone information
 */
export const getTimezoneInfo = () => {
  const utcNow = new Date();
  const istNow = getCurrentISTDate();
  
  return {
    utc_date: utcNow.toISOString(),
    ist_date: istNow.toISOString(),
    current_date_string_ist: getCurrentISTDateString(),
    timezone_offset: '+05:30',
    offset_hours: IST_OFFSET_HOURS,
    locale: 'Asia/Kolkata'
  };
};

/**
 * Get current timestamp for database insertion (IST)
 * @returns {string} Current timestamp in format suitable for database
 */
export const getDatabaseTimestamp = () => {
  return getCurrentISTTimestamp();
};

/**
 * Format database timestamp for display
 * @param {string|Date} dbTimestamp - Database timestamp
 * @returns {string} Formatted timestamp for Indian users
 */
export const formatDatabaseTimestamp = (dbTimestamp) => {
  const date = new Date(dbTimestamp);
  const istDate = convertUTCToIST(date);
  
  return istDate.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};

export default {
  getCurrentISTDate,
  convertUTCToIST,
  convertISTToUTC,
  getCurrentISTDateString,
  getCurrentISTTimestamp,
  formatDateForIndianLocale,
  getDateString,
  isSameDateIST,
  getTimezoneInfo,
  getDatabaseTimestamp,
  formatDatabaseTimestamp
};