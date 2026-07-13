import { Injectable, BadRequestException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private razorpay: Razorpay;

  constructor(private configService: ConfigService) {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');

    if (!keyId || !keySecret) {
      throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment variables');
    }

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  async createOrder(amount: number, currency: string = 'INR', receipt?: string) {
    try {
      const options = {
        amount: amount,
        currency: currency,
        receipt: receipt || `receipt_${Date.now()}`,
      };

      const order = await this.razorpay.orders.create(options);

      return {
        success: true,
        data: {
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
        },
      };
    } catch (error: any) {
      if (error.statusCode === 401) {
        throw new UnauthorizedException('Invalid Razorpay credentials');
      }
      throw new InternalServerErrorException(`Failed to create Razorpay order: ${error.message}`);
    }
  }

  verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string): boolean {
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
    
    if (!keySecret) {
      throw new Error('RAZORPAY_KEY_SECRET must be set in environment variables');
    }

    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    return generatedSignature === razorpaySignature;
  }
}
