import { UserRepository, User } from '../repositories/user.repository';

// Business logic layer — anonymous device registration
export class AuthService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async loginAnonymous(deviceId: string): Promise<User> {
    return this.userRepository.findOrCreate('anonymous', deviceId);
  }
}
