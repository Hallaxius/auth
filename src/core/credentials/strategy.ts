/**
 * Authentication strategy configuration.
 *
 * Determines which identifier(s) are required for user registration and login.
 */
export enum AuthStrategy {
	/**
	 * Username-only authentication.
	 * - Registration requires: username, password
	 * - Login requires: username, password
	 * - Email is optional and not used for authentication
	 */
	UsernameOnly = 'username-only',

	/**
	 * Email-only authentication.
	 * - Registration requires: email, password
	 * - Login requires: email, password
	 * - Username is optional and not used for authentication
	 */
	EmailOnly = 'email-only',

	/**
	 * Combined username and email authentication.
	 * - Registration requires: username, email, password
	 * - Login accepts: username OR email, plus password
	 * - Both username and email are unique identifiers
	 */
	UsernameEmail = 'username-email',
}